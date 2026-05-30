const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Common request headers to mimic browser
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

// Route 1: Fund Profile, Managers, Size & Historical Performance
app.get('/api/fund/:code', async (req, res) => {
  const { code } = req.params;
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: '无效的基金代码，必须为6位数字' });
  }

  try {
    // 1. Fetch pingzhongdata (basic variables, managers, history size)
    const detailUrl = `http://fund.eastmoney.com/pingzhongdata/${code}.js`;
    const detailRes = await fetch(detailUrl, { headers: { ...HEADERS, 'Referer': 'http://fund.eastmoney.com/' } });
    if (!detailRes.ok) {
      throw new Error(`无法获取基金JS详情: ${detailRes.statusText}`);
    }
    const text = await detailRes.text();

    // Extract basic js variables
    const getValue = (varName) => {
      const match = text.match(new RegExp(`var\\s+${varName}\\s*=\\s*"(.*?)";`));
      return match ? match[1] : '';
    };

    const fundName = getValue('fS_name');
    const fundCode = getValue('fS_code') || code;
    const syl_1y = getValue('syl_1y'); // 1 month
    const syl_3y = getValue('syl_3y'); // 3 month
    const syl_6y = getValue('syl_6y'); // 6 month
    const syl_1n = getValue('syl_1n'); // 1 year

    // Parse JSON-like variables
    const parseJsonVar = (varName) => {
      // Find where variable starts and match until the semicolon
      const regex = new RegExp(`var\\s+${varName}\\s*=\\s*([\\s\\S]*?);`);
      const match = text.match(regex);
      if (match) {
        try {
          // Sometimes it contains unquoted keys or comments. Let's clean or parse safely.
          let rawStr = match[1].trim();
          // Evaluate safely in sandbox-like if possible or simple parse.
          // Since this is trusted data from Eastmoney, we can parse it.
          // To be safe, we can parse simple JSON or format it first.
          // Most Eastmoney JS vars are valid JSON or can be evaluated.
          // We will use a safe eval or simple cleaning. Let's do a simple clean-up to JSON:
          // Replace unquoted keys, remove trailing commas, remove comments.
          // Actually, we can use a Function constructor for evaluation safely in the backend.
          const fn = new Function(`return ${rawStr};`);
          return fn();
        } catch (e) {
          console.error(`Error parsing JS variable ${varName}:`, e);
          return null;
        }
      }
      return null;
    };

    const managers = parseJsonVar('Data_currentFundManager') || [];
    const scaleData = parseJsonVar('Data_fluctuationScale') || null;
    const assetAllocation = parseJsonVar('Data_assetAllocation') || null;
    const performanceEvaluation = parseJsonVar('Data_performanceEvaluation') || null;
    const buyRedemption = parseJsonVar('Data_buySedemption') || null;

    // 2. Fetch jbgk (Fund basic profile for company details)
    const jbgkUrl = `http://fundf10.eastmoney.com/jbgk_${code}.html`;
    const jbgkRes = await fetch(jbgkUrl, { headers: HEADERS });
    const jbgkText = await jbgkRes.text();

    // Extract company link and ID
    // Look for: 基金管理人：<a href="//fund.eastmoney.com/company/80000222.html">华夏基金</a>
    const companyMatch = jbgkText.match(/基金管理人.*?<a\s+href="[^"]*?company\/(\d+)\.html"[^>]*?>(.*?)<\/a>/s);
    const companyId = companyMatch ? companyMatch[1] : '';
    const companyName = companyMatch ? companyMatch[2] : '';

    // Extract other metadata
    const extractJbgkField = (label) => {
      const match = jbgkText.match(new RegExp(`<th>${label}</th>\\s*<td[^>]*?>(.*?)<\/td>`, 'is'));
      if (match) {
        return match[1].replace(/<.*?>/g, '').replace(/&nbsp;/g, ' ').trim();
      }
      const fallbackMatch = jbgkText.match(new RegExp(`${label}.*?<td[^>]*?>(.*?)<\/td>`, 's'));
      if (fallbackMatch) {
        return fallbackMatch[1].replace(/<.*?>/g, '').replace(/&nbsp;/g, ' ').trim();
      }
      return '';
    };

    const fundFullName = extractJbgkField('基金全称');
    const fundType = extractJbgkField('基金类型');
    const launchDate = extractJbgkField('发行日期');
    const establishDate = extractJbgkField('成立日期/规模');
    const custodian = extractJbgkField('基金托管人');
    const mFee = extractJbgkField('管理费率');
    const cFee = extractJbgkField('托管费率');
    const benchmark = extractJbgkField('业绩比较基准');

    // 3. Fetch holdings
    // Extract years from arryear in text, e.g., arryear:[2026,2025...]
    let years = [new Date().getFullYear()];
    const arryearMatch = text.match(/arryear:\[(.*?)\]/);
    if (arryearMatch) {
      years = arryearMatch[1].split(',').map(y => parseInt(y.trim()));
    }

    let holdings = [];
    let holdingsDate = '';
    
    // We will search for the latest holdings by trying recent years and quarters
    for (const year of years) {
      if (holdings.length > 0) break;
      for (const month of [12, 9, 6, 3]) {
        const holdingsUrl = `http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${code}&year=${year}&month=${month}`;
        try {
          const hRes = await fetch(holdingsUrl, {
            headers: {
              ...HEADERS,
              'Referer': `http://fundf10.eastmoney.com/ccmx_${code}.html`
            }
          });
          const hText = await hRes.text();
          
          const contentMatch = hText.match(/content:"(.*?)",\s*arryear/);
          if (!contentMatch) continue;

          let contentHtml = contentMatch[1].replace(/\\"/g, '"').replace(/\\\\\//g, '/').replace(/\\\//g, '/');
          
          // Check if there are rows in the table
          const trMatches = contentHtml.match(/<tr>(.*?)<\/tr>/gs) || [];
          const validRows = [];
          
          for (const tr of trMatches) {
            if (tr.includes('序号') || tr.includes('股票代码')) continue;
            // Parse tds
            const tdMatches = tr.match(/<td.*?>(.*?)<\/td>/gs) || [];
            const tdVals = tdMatches.map(td => td.replace(/<.*?>/g, '').replace(/&nbsp;/g, ' ').trim());
            
            if (tdVals.length >= 6) {
              // Identify cells:
              // Index 0: rank
              // Index 1: code (5 or 6 alphanumeric)
              // Index 2: name
              // Weight is the cell that ends with %
              const weightCell = tdVals.find(cell => cell.endsWith('%'));
              if (weightCell) {
                validRows.push({
                  rank: tdVals[0],
                  code: tdVals[1],
                  name: tdVals[2],
                  weight: weightCell,
                  shares: tdVals[tdVals.indexOf(weightCell) + 1] || '',
                  value: tdVals[tdVals.indexOf(weightCell) + 2] || ''
                });
              }
            }
          }

          if (validRows.length > 0) {
            holdings = validRows;
            const dateMatch = contentHtml.match(/截止至：<font class=['"]px12['"]>(.*?)<\/font>/);
            holdingsDate = dateMatch ? dateMatch[1] : `${year}-${month}`;
            break;
          }
        } catch (e) {
          console.error(`Error fetching holdings for ${year}-${month}:`, e);
        }
      }
    }

    res.json({
      code: fundCode,
      name: fundName,
      fullName: fundFullName,
      type: fundType,
      launchDate,
      establishDate,
      custodian,
      fees: {
        management: mFee,
        custody: cFee
      },
      benchmark,
      performance: {
        month1: syl_1y,
        month3: syl_3y,
        month6: syl_6y,
        year1: syl_1n
      },
      company: {
        id: companyId,
        name: companyName
      },
      managers,
      scaleData,
      assetAllocation,
      performanceEvaluation,
      buyRedemption,
      holdings,
      holdingsDate
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取基金数据失败: ' + err.message });
  }
});

// Route 2: Fund Company Details
app.get('/api/company/:cid', async (req, res) => {
  const { cid } = req.params;
  if (!/^\d+$/.test(cid)) {
    return res.status(400).json({ error: '无效的公司ID' });
  }

  try {
    const url = `http://fund.eastmoney.com/company/${cid}.html`;
    const rRes = await fetch(url, { headers: HEADERS });
    const text = await rRes.text();

    const getLabelVal = (label) => {
      // Look for e.g. 成立日期: and then the next label class="grey"
      const regex = new RegExp(`${label}:\\s*<label class="grey">(.*?)<\/label>`, 's');
      const match = text.match(regex);
      if (match) {
        return match[1].replace(/<.*?>/g, '').trim();
      }
      return '';
    };

    const generalManagerMatch = text.match(/总经理.*?&nbsp;(.*?)\s*<\/p>/s) || text.match(/总经理.*?:\s*(.*?)\s*<\/p>/s);
    const generalManager = generalManagerMatch ? generalManagerMatch[1].replace(/<.*?>/g, '').replace(/&nbsp;/g, '').trim() : '';

    const addressMatch = text.match(/办公地址:.*?\s*(.*?)\s*<\/p>/s) || text.match(/办公地址:.*?<label[^>]*?>(.*?)<\/label>/s);
    const address = addressMatch ? addressMatch[1].replace(/<.*?>/g, '').replace(/&nbsp;/g, '').trim() : '';

    const webMatch = text.match(/网站地址:.*?\s*(.*?)\s*<\/p>/s) || text.match(/网站地址:.*?<label[^>]*?>(.*?)<\/label>/s);
    const website = webMatch ? webMatch[1].replace(/<.*?>/g, '').replace(/&nbsp;/g, '').trim() : '';

    const hotlineMatch = text.match(/客服热线:.*?\s*(.*?)\s*<\/p>/s) || text.match(/客服热线:.*?<label[^>]*?>(.*?)<\/label>/s);
    const hotline = hotlineMatch ? hotlineMatch[1].replace(/<.*?>/g, '').replace(/&nbsp;/g, '').trim() : '';

    const scaleMatch = text.match(/管理规模.*?<\/a>:\s*<label class="grey">(.*?)<\/label>/is);
    const scale = scaleMatch ? scaleMatch[1].replace(/<.*?>/g, '').trim() : '';
    
    const fundCountMatch = text.match(/基金数量:\s*<label class="grey"><a[^>]*?>(\d+)<\/a>只<\/label>/is);
    const fundCount = fundCountMatch ? fundCountMatch[1] : '';

    const managerCountMatch = text.match(/经理人数:\s*<label class="grey"><a[^>]*?>(\d+)<\/a>人<\/label>/is);
    const managerCount = managerCountMatch ? managerCountMatch[1] : '';

    const establishDate = getLabelVal('成立日期');
    const companyNature = getLabelVal('公司性质');

    res.json({
      id: cid,
      generalManager,
      address,
      website,
      hotline,
      scale,
      fundCount,
      managerCount,
      establishDate,
      companyNature
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取基金公司数据失败: ' + err.message });
  }
});

// Route 3: Real-time Stock Prices & Valuation calculation
app.get('/api/realtime', async (req, res) => {
  const { stocks } = req.query; // Expect comma separated values, e.g. sz300308,sh688012
  if (!stocks) {
    return res.status(400).json({ error: '缺少stocks参数' });
  }

  try {
    const list = stocks.split(',');
    // Map to Sina format codes
    const sinaCodes = list.map(code => {
      let codeStr = code.trim();
      // If code starts with sh/sz/hk/gb_ already, keep it
      if (/^(sh|sz|hk|gb_)/i.test(codeStr)) {
        return codeStr.toLowerCase();
      }
      
      // Determine by length and prefix
      if (codeStr.length === 5) {
        return `hk${codeStr}`;
      } else if (codeStr.length === 6) {
        if (codeStr.startsWith('6') || codeStr.startsWith('9') || codeStr.startsWith('5')) {
          return `sh${codeStr}`;
        } else {
          return `sz${codeStr}`;
        }
      } else if (codeStr.length === 3 || codeStr.length === 4) {
        // Assume US stock
        return `gb_${codeStr.toLowerCase()}`;
      }
      return codeStr.toLowerCase();
    });

    const url = `http://hq.sinajs.cn/list=${sinaCodes.join(',')}`;
    const sRes = await fetch(url, { headers: { ...HEADERS, 'Referer': 'https://finance.sina.com.cn' } });
    const buffer = await sRes.arrayBuffer();
    // Decode Sina API response using GBK
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(buffer);

    const lines = text.split('\n');
    const results = {};

    lines.forEach(line => {
      // Match e.g. var hq_str_sz300308="...";
      const match = line.match(/var\s+hq_str_(.*?)\s*=\s*"(.*?)";/);
      if (match) {
        const rawCode = match[1]; // e.g. sz300308
        const dataStr = match[2];
        const fields = dataStr.split(',');

        if (fields.length <= 1) {
          return;
        }

        let name = '';
        let current = 0;
        let yesterdayClose = 0;
        let changePercent = 0;

        if (rawCode.startsWith('hk')) {
          // HK stock
          name = fields[1];
          current = parseFloat(fields[6]);
          yesterdayClose = parseFloat(fields[3]);
          changePercent = parseFloat(fields[8]); // HK stock response usually contains change percentage directly
          if (isNaN(changePercent) && yesterdayClose > 0) {
            changePercent = ((current - yesterdayClose) / yesterdayClose) * 100;
          }
        } else if (rawCode.startsWith('gb_')) {
          // US stock
          name = fields[0];
          current = parseFloat(fields[1]);
          yesterdayClose = parseFloat(fields[26]);
          changePercent = parseFloat(fields[2]); // US stock response usually contains change percentage directly
          if (isNaN(changePercent) && yesterdayClose > 0) {
            changePercent = ((current - yesterdayClose) / yesterdayClose) * 100;
          }
        } else {
          // A-share (SH/SZ)
          name = fields[0];
          current = parseFloat(fields[3]);
          yesterdayClose = parseFloat(fields[2]);
          if (yesterdayClose > 0) {
            changePercent = ((current - yesterdayClose) / yesterdayClose) * 100;
          }
        }

        // Map back to original code format to match query
        // E.g., strip sh/sz prefix to match original code
        const cleanCode = rawCode.replace(/^(sh|sz|hk|gb_)/, '');

        results[cleanCode] = {
          rawCode,
          name,
          current: isNaN(current) ? 0 : current,
          yesterdayClose: isNaN(yesterdayClose) ? 0 : yesterdayClose,
          changePercent: isNaN(changePercent) ? 0 : parseFloat(changePercent.toFixed(2))
        };
      }
    });

    res.json(results);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取实时股价失败: ' + err.message });
  }
});

// Route 4: Market Indices
app.get('/api/indices', async (req, res) => {
  try {
    const url = 'http://hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006,s_sz399300,gb_dji,gb_ixic,gb_inx';
    const sRes = await fetch(url, { headers: { ...HEADERS, 'Referer': 'https://finance.sina.com.cn' } });
    const buffer = await sRes.arrayBuffer();
    const decoder = new TextDecoder('gbk');
    const text = decoder.decode(buffer);

    const lines = text.split('\n');
    const indices = [];

    lines.forEach(line => {
      const match = line.match(/var\s+hq_str_(s_)?(.*?)\s*=\s*"(.*?)";/);
      if (match) {
        const rawCode = match[2]; // e.g. sh000001 or gb_dji
        const dataStr = match[3];
        const fields = dataStr.split(',');

        if (fields.length >= 4) {
          let name = fields[0];
          let value = 0;
          let change = 0;
          let changePercent = 0;

          if (rawCode.startsWith('gb_')) {
            if (rawCode === 'gb_dji') name = '道琼斯';
            if (rawCode === 'gb_ixic') name = '纳斯达克';
            if (rawCode === 'gb_inx') name = '标普500';
            value = parseFloat(fields[1]);
            change = parseFloat(fields[4]);
            changePercent = parseFloat(fields[2]);
          } else {
            if (rawCode === 'sh000001') name = '上证指数';
            if (rawCode === 'sz399001') name = '深证成指';
            if (rawCode === 'sz399006') name = '创业板指';
            if (rawCode === 'sz399300') name = '沪深300';
            value = parseFloat(fields[1]);
            change = parseFloat(fields[2]);
            changePercent = parseFloat(fields[3]);
          }

          indices.push({
            code: rawCode,
            name,
            value: isNaN(value) ? 0 : value,
            change: isNaN(change) ? 0 : change,
            changePercent: isNaN(changePercent) ? 0 : parseFloat(changePercent.toFixed(2))
          });
        }
      }
    });

    res.json(indices);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取指数失败: ' + err.message });
  }
});

// Route 5: Official Eastmoney Real-time Valuation
app.get('/api/fundgz/:code', async (req, res) => {
  const { code } = req.params;
  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: '无效的基金代码' });
  }

  try {
    const url = `http://fundgz.1234567.com.cn/js/${code}.js`;
    const sRes = await fetch(url, { headers: HEADERS });
    const text = await sRes.text();
    
    const match = text.match(/jsonpgz\(([\s\S]*?)\);/);
    if (match) {
      try {
        const data = JSON.parse(match[1]);
        res.json(data);
      } catch (err) {
        res.status(500).json({ error: '官方估值解析失败' });
      }
    } else {
      res.status(404).json({ error: '未找到官方估值数据' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '获取官方估值失败: ' + err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
