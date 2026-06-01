// Global App State
let currentFundData = null;
let realtimeTimer = null;
let indexTimer = null;
let scaleChartInstance = null;
let pieChartInstance = null;
let managerChartInstances = [];
let latestIndices = [];
let currentHoldings = [];
let currentPrices = {};
let watchlistEditMode = false;


// Helper: Resolve API URLs depending on environment
function getApiUrl(path) {
  // If running from local assets in WebView (protocol is file:), use localhost:3000
  const base = window.location.protocol === 'file:' ? 'http://localhost:3000' : '';
  return base + path;
}

// Initialize ECharts instances safely
function initScaleChart(categories, seriesData) {
  const chartDom = document.getElementById('scale-chart');
  if (!chartDom) return;
  
  if (scaleChartInstance) {
    scaleChartInstance.dispose();
  }
  
  const isDark = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) || document.documentElement.classList.contains('dark-theme');
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const tooltipText = isDark ? '#f8fafc' : '#0f172a';
  const labelColor = isDark ? '#cbd5e1' : '#64748b';
  const axisColor = isDark ? '#475569' : '#cbd5e1';
  const gridColor = isDark ? '#334155' : '#e2e8f0';

  scaleChartInstance = echarts.init(chartDom);
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: tooltipText, fontSize: 12 },
      formatter: '{b}: {c} 亿元'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: labelColor, fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: labelColor, fontSize: 10 },
      splitLine: { lineStyle: { color: gridColor } }
    },
    series: [{
      data: seriesData.map(item => item.y),
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 6,
      itemStyle: { color: '#5865f2' },
      lineStyle: { width: 3, shadowBlur: 10, shadowColor: 'rgba(88, 101, 242, 0.4)' },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(88, 101, 242, 0.25)' },
          { offset: 1, color: 'rgba(88, 101, 242, 0.00)' }
        ])
      }
    }]
  };
  scaleChartInstance.setOption(option);
}

function initHoldingsPieChart(holdingsData) {
  const chartDom = document.getElementById('holdings-pie-chart');
  if (!chartDom) return;

  if (pieChartInstance) {
    pieChartInstance.dispose();
    pieChartInstance = null;
  }

  if (!holdingsData || holdingsData.length === 0) {
    chartDom.innerHTML = '<div class="no-history-text" style="line-height:200px; text-align:center; padding-top: 80px;">暂无股票持仓</div>';
    return;
  }

  // Pre-process pie data
  const pieData = holdingsData.map(item => ({
    name: item.name,
    value: parseFloat(item.weight.replace('%', ''))
  }));

  // Add "Others" to complete the pie if needed
  const totalWeight = pieData.reduce((sum, item) => sum + item.value, 0);
  if (totalWeight < 100) {
    pieData.push({
      name: '其他非重仓资产',
      value: parseFloat((100 - totalWeight).toFixed(2))
    });
  }

  const isDark = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) || document.documentElement.classList.contains('dark-theme');
  const tooltipBg = isDark ? '#1e293b' : '#ffffff';
  const tooltipBorder = isDark ? '#334155' : '#e2e8f0';
  const tooltipText = isDark ? '#f8fafc' : '#0f172a';

  pieChartInstance = echarts.init(chartDom);
  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: tooltipBg,
      borderColor: tooltipBorder,
      textStyle: { color: tooltipText, fontSize: 12 },
      formatter: '{b}: {c}%'
    },
    legend: {
      show: false
    },
    series: [
      {
        name: '持仓占比',
        type: 'pie',
        radius: ['45%', '75%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#f8fafc',
          borderWidth: 2
        },
        label: {
          show: true,
          position: 'outside',
          color: '#94a3b8',
          fontSize: 10,
          formatter: '{b}\n{d}%'
        },
        labelLine: {
          show: true,
          length: 8,
          length2: 6,
          lineStyle: {
            color: '#384252'
          }
        },
        data: pieData
      }
    ]
  };
  pieChartInstance.setOption(option);
}

function initManagerRadarChart(domId, power) {
  const chartDom = document.getElementById(domId);
  if (!chartDom) return;

  // Dispose if already exists in registry
  const existing = echarts.getInstanceByDom(chartDom);
  if (existing) {
    existing.dispose();
  }

  const chart = echarts.init(chartDom);
  managerChartInstances.push(chart);

  // Radar categories map
  const indicator = power.categories.map((cat, idx) => ({
    name: cat,
    max: 100
  }));

  const isDark = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) || document.documentElement.classList.contains('dark-theme');
  const radarLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)';
  const labelColor = isDark ? '#cbd5e1' : '#64748b';

  const option = {
    backgroundColor: 'transparent',
    radar: {
      indicator: indicator,
      radius: '65%',
      splitNumber: 4,
      axisName: {
        color: labelColor,
        fontSize: 10,
        padding: [3, 5]
      },
      splitLine: {
        lineStyle: {
          color: radarLineColor
        }
      },
      splitArea: {
        show: false
      },
      axisLine: {
        lineStyle: {
          color: radarLineColor
        }
      }
    },
    series: [
      {
        name: '能力指标',
        type: 'radar',
        data: [
          {
            value: power.data,
            name: '综合评分',
            symbol: 'none',
            itemStyle: { color: '#5865f2' },
            areaStyle: {
              color: 'rgba(88, 101, 242, 0.3)'
            },
            lineStyle: {
              width: 2,
              color: '#5865f2'
            }
          }
        ]
      }
    ]
  };
  chart.setOption(option);
}

// Format numbers nicely
function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '--';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Time update helper for top status bar
function updateStatusBarTime() {
  const timeDom = document.getElementById('status-bar-time');
  if (timeDom) {
    const now = new Date();
    let hrs = now.getHours().toString().padStart(2, '0');
    let mins = now.getMinutes().toString().padStart(2, '0');
    timeDom.innerText = `${hrs}:${mins}`;
  }
}
setInterval(updateStatusBarTime, 1000);
updateStatusBarTime();

// Keypad controls
const keypadInput = document.getElementById('fund-code-input');
const clearBtn = document.getElementById('input-clear-btn');

document.querySelectorAll('.key-btn').forEach(btn => {
  if (btn.id === 'key-delete' || btn.id === 'key-search') return;
  btn.addEventListener('click', () => {
    if (keypadInput.value.length < 6) {
      keypadInput.value += btn.innerText;
      updateInputControls();
    }
  });
});

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    keypadInput.value = '';
    updateInputControls();
  });
}

const deleteBtn = document.getElementById('key-delete');
if (deleteBtn) {
  deleteBtn.addEventListener('click', () => {
    keypadInput.value = keypadInput.value.slice(0, -1);
    updateInputControls();
  });
}

function updateInputControls() {
  if (keypadInput.value.length > 0) {
    clearBtn.style.display = 'flex';
  } else {
    clearBtn.style.display = 'none';
  }
}

// Search Trigger
const searchBtn = document.getElementById('key-search');
if (searchBtn) {
  searchBtn.addEventListener('click', () => {
    const code = keypadInput.value;
    if (code.length === 6 && /^\d{6}$/.test(code)) {
      queryFund(code);
    } else {
      alert('请输入完整的6位数字基金代码');
    }
  });
}

// Search History Managers
const modelSelect = document.getElementById('val-model-select');
if (modelSelect) {
  modelSelect.addEventListener('change', () => {
    localStorage.setItem('preferred_valuation_model', modelSelect.value);
    if (currentHoldings && currentHoldings.length > 0 && currentPrices) {
      calculateEstimatedNAV(currentHoldings, currentPrices);
    }
  });
}

function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem('fund_search_history') || '[]');
  } catch (e) {
    return [];
  }
}

function saveSearchHistory(code, name) {
  let history = getSearchHistory();
  // Remove duplicate
  history = history.filter(item => item.code !== code);
  // Add to top
  history.unshift({ code, name });
  // Limit to 8 items
  if (history.length > 8) history.pop();
  localStorage.setItem('fund_search_history', JSON.stringify(history));
  renderHistoryChips();
}

function renderHistoryChips() {
  const container = document.getElementById('history-chips');
  if (!container) return;
  container.innerHTML = '';
  
  const history = getSearchHistory();
  if (history.length === 0) {
    container.innerHTML = '<span class="no-history-text">暂无查询历史</span>';
    return;
  }
  
  history.forEach(item => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerText = `${item.name} (${item.code})`;
    chip.addEventListener('click', () => {
      queryFund(item.code);
    });
    container.appendChild(chip);
  });
}
renderHistoryChips();

// Setup Hot Chips and click listener
document.querySelectorAll('.hot-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const code = chip.getAttribute('data-code');
    queryFund(code);
  });
});

// App Tabs Manager
document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const tabId = item.getAttribute('data-tab');
    
    // Deactivate all tabs
    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-panels .tab-panel').forEach(panel => panel.classList.remove('active'));
    
    // Activate clicked tab
    item.classList.add('active');
    const targetPanel = document.getElementById(tabId);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }

    // Trigger charts redraw (important for correct width rendering)
    setTimeout(() => {
      if (tabId === 'panel-overview' && scaleChartInstance) {
        scaleChartInstance.resize();
      }
      if (tabId === 'panel-holdings' && pieChartInstance) {
        pieChartInstance.resize();
      }
      if (tabId === 'panel-managers') {
        managerChartInstances.forEach(chart => chart.resize());
      }
    }, 100);
  });
});

// Return navigation helpers
const returnToMain = () => {
  stopDashboardRealtime();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('main-page').classList.add('active');
  renderWatchlist();
};

const handleBackNavigation = () => {
  if (window.history && window.history.length > 1) {
    window.history.back();
  } else {
    returnToMain();
  }
};

const dbackBtn = document.getElementById('dashboard-back-btn');
if (dbackBtn) dbackBtn.addEventListener('click', handleBackNavigation);

const sbackBtn = document.getElementById('search-back-btn');
if (sbackBtn) sbackBtn.addEventListener('click', handleBackNavigation);

// Refresh button on Dashboard
const refreshBtn = document.getElementById('dashboard-refresh-btn');
if (refreshBtn) {
  refreshBtn.addEventListener('click', () => {
    if (currentFundData) {
      queryFund(currentFundData.code, false);
    }
  });
}

// Fetch Market indices
async function fetchIndices() {
  try {
    const res = await fetch(getApiUrl('/api/indices'));
    if (!res.ok) throw new Error('Indices API failure');
    const data = await res.json();
    
    latestIndices = data;
    
    // Update tickers
    renderIndicesTicker(data);
    updateSearchIndices(data);
  } catch (err) {
    console.error('Error fetching market indices:', err);
  }
}

function renderIndicesTicker(indices) {
  const tickerBar = document.getElementById('indices-ticker-bar');
  if (!tickerBar) return;
  tickerBar.innerHTML = '';
  
  indices.forEach(idx => {
    const item = document.createElement('div');
    item.className = 'ticker-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'ticker-item-name';
    nameSpan.innerText = idx.name;
    
    const valSpan = document.createElement('span');
    valSpan.className = 'ticker-item-val';
    valSpan.innerText = idx.value.toFixed(2);
    
    const rateSpan = document.createElement('span');
    const rateVal = idx.changePercent;
    rateSpan.innerText = `${rateVal > 0 ? '+' : ''}${rateVal.toFixed(2)}%`;
    
    if (rateVal > 0) {
      valSpan.className = 'ticker-item-val text-up';
      rateSpan.className = 'ticker-item-rate text-up';
    } else if (rateVal < 0) {
      valSpan.className = 'ticker-item-val text-down';
      rateSpan.className = 'ticker-item-rate text-down';
    } else {
      valSpan.className = 'ticker-item-val text-flat';
      rateSpan.className = 'ticker-item-rate text-flat';
    }
    
    item.appendChild(nameSpan);
    item.appendChild(valSpan);
    item.appendChild(rateSpan);
    tickerBar.appendChild(item);
  });
}

function updateSearchIndices(indices) {
  indices.forEach(idx => {
    // Find mini index cards on search screen
    const card = document.querySelector(`.mini-index-card[data-code="${idx.code}"]`);
    if (card) {
      const valSpan = card.querySelector('.index-val');
      const rateSpan = card.querySelector('.index-rate');
      
      if (valSpan && rateSpan) {
        valSpan.innerText = idx.value.toFixed(2);
        
        const rateVal = idx.changePercent;
        rateSpan.innerText = `${rateVal > 0 ? '+' : ''}${rateVal.toFixed(2)}%`;
        
        if (rateVal > 0) {
          valSpan.className = 'index-val text-up';
          rateSpan.className = 'index-rate bg-up';
        } else if (rateVal < 0) {
          valSpan.className = 'index-val text-down';
          rateSpan.className = 'index-rate bg-down';
        } else {
          valSpan.className = 'index-val text-flat';
          rateSpan.className = 'index-rate bg-flat';
        }
      }
    }
  });
}

// Periodically load index info
fetchIndices();
indexTimer = setInterval(fetchIndices, 15000);

// Stop polling realtime data
function stopDashboardRealtime() {
  if (realtimeTimer) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
}

// Start polling realtime stock valuation
function startDashboardRealtime(holdings) {
  stopDashboardRealtime();
  currentHoldings = holdings;
  
  const updateValuation = async () => {
    if (!currentFundData) return;
    
    try {
      const stockCodes = holdings.map(h => h.code);
      if (stockCodes.length === 0) {
        // No stocks, maybe bond fund
        document.getElementById('valuation-percentage').innerText = '0.00%';
        document.getElementById('valuation-status').innerText = '该基金暂无股票持仓，无法估值';
        document.getElementById('valuation-card').className = 'valuation-hero-card';
        
        // Clear details grid
        document.getElementById('top10-weight-sum').innerText = '--';
        document.getElementById('top10-avg-change').innerText = '--';
        document.getElementById('top10-avg-change').className = 'di-val text-flat';
        const stockPosDom = document.getElementById('stock-position-val');
        if (stockPosDom) {
          let stockPosition = 0;
          let hasStockAlloc = false;
          if (currentFundData && currentFundData.assetAllocation && currentFundData.assetAllocation.series) {
            const stockSeries = currentFundData.assetAllocation.series.find(s => s.name && s.name.includes('股票'));
            if (stockSeries && stockSeries.data && stockSeries.data.length > 0) {
              stockPosition = stockSeries.data[stockSeries.data.length - 1];
              hasStockAlloc = true;
            }
          }
          stockPosDom.innerText = hasStockAlloc ? `${stockPosition.toFixed(2)}%` : '--';
        }
        
        // Clear holdings list
        const holdingsItemsContainer = document.getElementById('holdings-list-items');
        if (holdingsItemsContainer) {
          holdingsItemsContainer.innerHTML = '<span class="no-history-text" style="display:block; text-align:center; padding: 20px;">该基金暂无公开的股票持仓明细</span>';
        }
        
        // Clear pie chart
        initHoldingsPieChart([]);
        
        return;
      }
      
      const res = await fetch(getApiUrl(`/api/realtime?stocks=${stockCodes.join(',')}`));
      if (!res.ok) throw new Error('Realtime API error');
      const prices = await res.json();
      currentPrices = prices;
      
      calculateEstimatedNAV(currentHoldings, currentPrices);
    } catch (e) {
      console.error('Error fetching realtime quotes:', e);
      document.getElementById('valuation-status').innerText = '估算更新失败，正在使用历史净值...';
    }
  };
  
  updateValuation();
  // Poll every 30 seconds
  realtimeTimer = setInterval(updateValuation, 30000);
}

// Calculate the final fund percentage and list updates
function calculateEstimatedNAV(holdings, prices) {
  let estimatedChangeSum = 0;
  let top10WeightSum = 0;
  let validStockChanges = [];
  
  const holdingsItemsContainer = document.getElementById('holdings-list-items');
  if (holdingsItemsContainer) holdingsItemsContainer.innerHTML = '';
  
  holdings.forEach(stock => {
    const weightNum = parseFloat(stock.weight.replace('%', ''));
    top10WeightSum += weightNum;
    
    const priceInfo = prices[stock.code];
    let changeRate = 0;
    let currentPriceText = '--';
    let yesterdayClose = 0;
    
    if (priceInfo) {
      changeRate = priceInfo.changePercent;
      currentPriceText = priceInfo.current.toFixed(2);
      yesterdayClose = priceInfo.yesterdayClose;
      validStockChanges.push(changeRate);
      
      // Stock Contribution = (weight % / 100) * changeRate %
      const contribution = (weightNum / 100) * changeRate;
      estimatedChangeSum += contribution;
    }
    
    // Render Stock List Card
    if (holdingsItemsContainer) {
      const card = document.createElement('div');
      card.className = 'holding-item-card';
      
      const infoCol = document.createElement('div');
      infoCol.className = 'h-stock-info';
      
      const nameTitle = document.createElement('span');
      nameTitle.className = 'h-stock-name';
      nameTitle.innerText = stock.name;
      
      const metaDiv = document.createElement('div');
      metaDiv.className = 'h-stock-meta';
      metaDiv.innerHTML = `<span>${stock.code}</span><span class="h-stock-weight">权重 ${stock.weight}</span>`;
      
      infoCol.appendChild(nameTitle);
      infoCol.appendChild(metaDiv);
      
      const pricingDiv = document.createElement('div');
      pricingDiv.className = 'h-stock-pricing';
      
      const priceCol = document.createElement('div');
      priceCol.className = 'h-price-col';
      
      const priceVal = document.createElement('span');
      priceVal.className = 'h-price-val';
      priceVal.innerText = currentPriceText;
      
      const priceChange = document.createElement('span');
      priceChange.className = 'h-price-change';
      priceChange.innerText = priceInfo ? `${changeRate > 0 ? '+' : ''}${changeRate.toFixed(2)}%` : '--';
      
      if (priceInfo) {
        if (changeRate > 0) {
          priceVal.className = 'h-price-val text-up';
          priceChange.className = 'h-price-change text-up';
        } else if (changeRate < 0) {
          priceVal.className = 'h-price-val text-down';
          priceChange.className = 'h-price-change text-down';
        } else {
          priceVal.className = 'h-price-val text-flat';
          priceChange.className = 'h-price-change text-flat';
        }
      }
      
      priceCol.appendChild(priceVal);
      priceCol.appendChild(priceChange);
      
      const compareCol = document.createElement('div');
      compareCol.className = 'h-compare-col';
      
      const compareLbl = document.createElement('span');
      compareLbl.className = 'h-compare-lbl';
      compareLbl.innerText = '较上期';
      
      const compareVal = document.createElement('span');
      let compareText = '--';
      let compareClass = 'text-flat';
      
      if (stock.comparePercent === '新进') {
        compareText = '新进';
        compareClass = 'text-new';
      } else if (stock.comparePercent) {
        const val = parseFloat(stock.comparePercent);
        if (val > 0) {
          compareText = `↑ ${val.toFixed(2)}%`;
          compareClass = 'text-up';
        } else if (val < 0) {
          compareText = `↓ ${Math.abs(val).toFixed(2)}%`;
          compareClass = 'text-down';
        } else {
          compareText = '0.00%';
          compareClass = 'text-flat';
        }
      }
      compareVal.className = `h-compare-val ${compareClass}`;
      compareVal.innerText = compareText;
      
      compareCol.appendChild(compareLbl);
      compareCol.appendChild(compareVal);

      const contribBadge = document.createElement('div');
      contribBadge.className = 'h-contribution-badge';
      
      const contribVal = priceInfo ? (weightNum * changeRate / 100) : 0;
      const contribText = priceInfo ? `${contribVal > 0 ? '+' : ''}${contribVal.toFixed(2)}%` : '--';
      contribBadge.innerHTML = `<span class="h-contrib-lbl">贡献估值</span><span>${contribText}</span>`;
      
      if (priceInfo) {
        if (contribVal > 0) contribBadge.className = 'h-contribution-badge bg-up';
        else if (contribVal < 0) contribBadge.className = 'h-contribution-badge bg-down';
        else contribBadge.className = 'h-contribution-badge bg-flat';
      } else {
        contribBadge.className = 'h-contribution-badge bg-flat';
      }
      
      pricingDiv.appendChild(priceCol);
      pricingDiv.appendChild(compareCol);
      pricingDiv.appendChild(contribBadge);
      
      card.appendChild(infoCol);
      card.appendChild(pricingDiv);
      
      holdingsItemsContainer.appendChild(card);
    }
  });

  // Calculate Average Top10 Change
  const avgStockChange = validStockChanges.length > 0
    ? (validStockChanges.reduce((s, c) => s + c, 0) / validStockChanges.length)
    : 0;

  // Extract overall stock position from currentFundData.assetAllocation
  let stockPosition = 100;
  let hasStockAlloc = false;
  if (currentFundData && currentFundData.assetAllocation && currentFundData.assetAllocation.series) {
    const stockSeries = currentFundData.assetAllocation.series.find(s => s.name && s.name.includes('股票'));
    if (stockSeries && stockSeries.data && stockSeries.data.length > 0) {
      stockPosition = stockSeries.data[stockSeries.data.length - 1];
      hasStockAlloc = true;
    }
  }

  // Update details in UI
  document.getElementById('top10-weight-sum').innerText = `${top10WeightSum.toFixed(2)}%`;
  document.getElementById('top10-avg-change').innerText = `${avgStockChange > 0 ? '+' : ''}${avgStockChange.toFixed(2)}%`;
  
  const stockPosDom = document.getElementById('stock-position-val');
  if (stockPosDom) {
    stockPosDom.innerText = hasStockAlloc ? `${stockPosition.toFixed(2)}%` : '--';
  }

  // Highlight stats row color for average change
  const avgSpan = document.getElementById('top10-avg-change');
  if (avgStockChange > 0) avgSpan.className = 'di-val text-up';
  else if (avgStockChange < 0) avgSpan.className = 'di-val text-down';
  else avgSpan.className = 'di-val text-flat';

  // Read valuation model selection
  const modelSelect = document.getElementById('val-model-select');
  const selectedModel = modelSelect ? modelSelect.value : getPreferredModel();

  let finalEstimatedChange = estimatedChangeSum;

  if (selectedModel === 'index') {
    let indexChange = 0;
    if (latestIndices && latestIndices.length > 0) {
      const csi300 = latestIndices.find(idx => idx.code === 'sz399300' || idx.code === 's_sz399300');
      if (csi300) {
        indexChange = csi300.changePercent;
      } else if (latestIndices[0]) {
        indexChange = latestIndices[0].changePercent;
      }
    }
    if (hasStockAlloc && stockPosition > top10WeightSum) {
      finalEstimatedChange = estimatedChangeSum + ((stockPosition - top10WeightSum) / 100) * indexChange;
    }
  }

  // Final Estimated change representation
  const valCard = document.getElementById('valuation-card');
  const valPct = document.getElementById('valuation-percentage');
  const valStat = document.getElementById('valuation-status');
  
  valPct.innerText = `${finalEstimatedChange > 0 ? '+' : ''}${finalEstimatedChange.toFixed(2)}%`;
  
  const now = new Date();
  const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
  document.getElementById('valuation-date').innerText = `更新于: ${dateStr}`;

  // Check market state / time bounds for friendly description
  const hrs = now.getHours();
  const min = now.getMinutes();
  const day = now.getDay(); // 0 is Sunday, 6 is Saturday
  
  let marketStateStr = '';
  if (day === 0 || day === 6) {
    marketStateStr = '周末股市休市，基于最后收盘价估算';
  } else {
    // Weekdays A-shares trade 9:30-11:30, 13:00-15:00
    const timeVal = hrs * 60 + min;
    const morningOpen = 9 * 60 + 30;
    const morningClose = 11 * 60 + 30;
    const afternoonOpen = 13 * 60;
    const afternoonClose = 15 * 60;
    
    if (timeVal < morningOpen) {
      marketStateStr = '交易尚未开始，基于昨日收盘价估算';
    } else if (timeVal > morningClose && timeVal < afternoonOpen) {
      marketStateStr = '午间休市，持仓股价格处于静止态';
    } else if (timeVal > afternoonClose) {
      marketStateStr = '收盘终期估算，与官方晚间净值可能有微差';
    } else {
      marketStateStr = '交易进行中，实时估算重仓股净值贡献';
    }
  }
  
  // Format model description
  let modelStr = '仅重仓估值';
  if (selectedModel === 'index') {
    let indexChange = 0;
    if (latestIndices && latestIndices.length > 0) {
      const csi300 = latestIndices.find(idx => idx.code === 'sz399300' || idx.code === 's_sz399300');
      if (csi300) indexChange = csi300.changePercent;
      else if (latestIndices[0]) indexChange = latestIndices[0].changePercent;
    }
    modelStr = `重仓+沪深300指数 (${stockPosition.toFixed(2)}% 仓位, 指数 ${indexChange > 0 ? '+' : ''}${indexChange.toFixed(2)}%)`;
  }
  valStat.innerText = `${marketStateStr} | ${modelStr}`;

  if (finalEstimatedChange > 0) {
    valCard.className = 'valuation-hero-card val-card-up';
    valPct.className = 'valuation-percentage text-up';
  } else if (finalEstimatedChange < 0) {
    valCard.className = 'valuation-hero-card val-card-down';
    valPct.className = 'valuation-percentage text-down';
  } else {
    valCard.className = 'valuation-hero-card';
    valPct.className = 'valuation-percentage text-flat';
  }
}

// Primary async function to query fund code
async function queryFund(code, pushToHistory = true) {
  // Show loading
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const loadingPage = document.getElementById('loading-page');
  const loadingTitle = document.getElementById('loading-title');
  loadingPage.classList.add('active');
  loadingTitle.innerText = `正在获取基金 (${code}) 的基本档案...`;

  try {
    // 1. Fetch Fund main object
    const fundRes = await fetch(getApiUrl(`/api/fund/${code}`));
    if (!fundRes.ok) {
      const errData = await fundRes.json();
      throw new Error(errData.error || '获取基金失败');
    }
    const fundData = await fundRes.json();
    currentFundData = fundData;
    
    // Save to history list
    saveSearchHistory(fundData.code, fundData.name);

    // Update loading screen
    loadingTitle.innerText = `已获取 ${fundData.name}，正在拉取基金公司档案...`;

    // 2. Fetch company info
    let companyData = null;
    if (fundData.company && fundData.company.id) {
      try {
        const compRes = await fetch(getApiUrl(`/api/company/${fundData.company.id}`));
        if (compRes.ok) {
          companyData = await compRes.json();
        }
      } catch (err) {
        console.error('Failed to load company details:', err);
      }
    }

    loadingTitle.innerText = `正在分析持仓股实时价格...`;

    // 3. Render Dashboard headers
    document.getElementById('fund-display-name').innerText = fundData.name;
    document.getElementById('fund-display-code').innerText = fundData.code;
    document.getElementById('fund-display-type').innerText = fundData.type || '混合型';
    
    // Attributes overview page
    document.getElementById('attr-short-name').innerText = fundData.name;
    document.getElementById('attr-full-name').innerText = fundData.fullName || fundData.name;
    document.getElementById('attr-launch-date').innerText = fundData.launchDate || '--';
    document.getElementById('attr-establish-date').innerText = fundData.establishDate || '--';
    document.getElementById('attr-custodian').innerText = fundData.custodian || '--';
    document.getElementById('attr-benchmark').innerText = fundData.benchmark || '--';
    document.getElementById('attr-limit-buy').innerText = fundData.limitBuy || '不限购';
    
    // Extract latest net worth and change
    if (fundData.netWorthTrend && fundData.netWorthTrend.length > 0) {
      const latestValObj = fundData.netWorthTrend[fundData.netWorthTrend.length - 1];
      const jzVal = latestValObj.y;
      const jzChange = latestValObj.equityReturn;
      const jzDate = new Date(latestValObj.x);
      const dateStr = `${jzDate.getMonth() + 1}-${jzDate.getDate()}`;
      
      document.getElementById('attr-latest-networth').innerText = `${jzVal.toFixed(4)} (${dateStr})`;
      
      const changeEl = document.getElementById('attr-latest-change');
      if (jzChange !== undefined && jzChange !== null && !isNaN(jzChange)) {
        changeEl.innerText = `${jzChange > 0 ? '+' : ''}${jzChange.toFixed(2)}%`;
        if (jzChange > 0) {
          changeEl.className = 'attr-val text-up';
        } else if (jzChange < 0) {
          changeEl.className = 'attr-val text-down';
        } else {
          changeEl.className = 'attr-val text-flat';
        }
      } else {
        changeEl.innerText = '0.00%';
        changeEl.className = 'attr-val text-flat';
      }
    } else {
      document.getElementById('attr-latest-networth').innerText = '--';
      document.getElementById('attr-latest-change').innerText = '--';
      document.getElementById('attr-latest-change').className = 'attr-val text-flat';
    }
    
    // Fees
    document.getElementById('fee-management').innerText = fundData.fees.management || '--';
    document.getElementById('fee-custody').innerText = fundData.fees.custody || '--';
    
    // Historical performance returns
    const updatePerformanceItem = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (val) {
        const numVal = parseFloat(val);
        el.innerText = `${numVal > 0 ? '+' : ''}${numVal.toFixed(2)}%`;
        if (numVal > 0) el.className = 'perf-val text-up';
        else if (numVal < 0) el.className = 'perf-val text-down';
        else el.className = 'perf-val text-flat';
      } else {
        el.innerText = '--';
        el.className = 'perf-val text-flat';
      }
    };
    
    updatePerformanceItem('perf-1m', fundData.performance.month1);
    updatePerformanceItem('perf-3m', fundData.performance.month3);
    updatePerformanceItem('perf-6m', fundData.performance.month6);
    updatePerformanceItem('perf-1y', fundData.performance.year1);

    // Scale card size representation
    let totalScaleText = '--';
    if (fundData.scaleData && fundData.scaleData.series && fundData.scaleData.series.length > 0) {
      const latestScaleVal = fundData.scaleData.series[fundData.scaleData.series.length - 1].y;
      totalScaleText = `${latestScaleVal.toFixed(2)} 亿元`;
    }
    document.getElementById('fund-total-scale').innerText = totalScaleText;

    // Asset allocation bars
    const allocContainer = document.getElementById('allocation-bars');
    if (allocContainer) {
      allocContainer.innerHTML = '';
      if (fundData.assetAllocation && fundData.assetAllocation.series) {
        const latestIdx = fundData.assetAllocation.categories.length - 1;
        const allocDate = fundData.assetAllocation.categories[latestIdx] || '';
        
        // Add date label
        const dateEl = document.createElement('div');
        dateEl.className = 'holdings-summary-bar';
        dateEl.innerText = `资产配置构成 (截至 ${allocDate})`;
        allocContainer.appendChild(dateEl);

        fundData.assetAllocation.series.forEach(asset => {
          if (asset.type !== 'line') { // Exclude net assets line
            const val = asset.data[latestIdx];
            if (val !== undefined && val !== null) {
              const row = document.createElement('div');
              row.className = 'alloc-item';
              row.innerHTML = `
                <div class="alloc-lbl-row">
                  <span class="alloc-name">${asset.name}</span>
                  <span class="alloc-val">${val.toFixed(2)}%</span>
                </div>
                <div class="alloc-progress-bg">
                  <div class="alloc-progress-fill" style="width: ${val}%"></div>
                </div>
              `;
              allocContainer.appendChild(row);
            }
          }
        });
      } else {
        allocContainer.innerHTML = '<span class="no-history-text">无资产配置明细数据</span>';
      }
    }

    // Holdings list header
    document.getElementById('holdings-date-label').innerText = `最近重仓持股 (截至季报：${fundData.holdingsDate || '--'})`;

    // 4. Managers UI render
    const managersContainer = document.getElementById('managers-list-container');
    if (managersContainer) {
      managersContainer.innerHTML = '';
      managerChartInstances = []; // Reset ECharts list for new radars
      
      if (fundData.managers && fundData.managers.length > 0) {
        fundData.managers.forEach((m, mIdx) => {
          const mCard = document.createElement('div');
          mCard.className = 'manager-card';
          
          // Image / Info
          const profileRow = document.createElement('div');
          profileRow.className = 'manager-profile-row';
          
          const avatarHtml = m.pic 
            ? `<img class="manager-avatar" src="${m.pic}" alt="${m.name}" onerror="this.outerHTML='<div class=\\'manager-avatar-placeholder\\'><i class=\\'fas fa-user-tie\\'></i></div>'">`
            : `<div class="manager-avatar-placeholder"><i class="fas fa-user-tie"></i></div>`;
            
          let starHtml = '';
          for (let i = 0; i < (m.star || 0); i++) {
            starHtml += '<i class="fas fa-star"></i>';
          }
          
          profileRow.innerHTML = `
            ${avatarHtml}
            <div class="manager-desc-col">
              <span class="manager-name">${m.name}</span>
              <div class="manager-stars">${starHtml}</div>
              <div class="manager-detail-meta">
                <span>任职时间: ${m.workTime || '--'}</span>
                <span>在管规模: ${m.fundSize || '--'}</span>
              </div>
            </div>
          `;
          
          mCard.appendChild(profileRow);
          
          // Managers abilities Radar Chart container if exists
          if (m.power && m.power.categories && m.power.categories.length > 0) {
            const radarContainer = document.createElement('div');
            radarContainer.className = 'm-power-radar-container';
            radarContainer.innerHTML = `
              <h4 class="card-title" style="font-size:12px; margin-bottom:10px; width:100%">经理能力画像 (综合评分: ${m.power.avr})</h4>
              <div class="chart-container" id="manager-radar-${mIdx}" style="height:180px"></div>
            `;
            mCard.appendChild(radarContainer);
            
            // Draw Radar after append to DOM
            setTimeout(() => {
              initManagerRadarChart(`manager-radar-${mIdx}`, m.power);
            }, 100);
          }
          
          managersContainer.appendChild(mCard);
        });
      } else {
        managersContainer.innerHTML = '<span class="no-history-text">暂无经理变动信息</span>';
      }
    }

    // 5. Company info render
    if (companyData) {
      document.getElementById('company-name').innerText = fundData.company.name || '--';
      document.getElementById('company-ceo').innerText = companyData.generalManager || '--';
      document.getElementById('company-establish-date').innerText = companyData.establishDate || '--';
      document.getElementById('company-address').innerText = companyData.address || '--';
      document.getElementById('company-website').innerText = companyData.website || '--';
      document.getElementById('company-hotline').innerText = companyData.hotline || '--';
      document.getElementById('company-scale').innerText = companyData.scale || '--';
      document.getElementById('company-fund-count').innerText = companyData.fundCount ? `${companyData.fundCount}只` : '--';
      document.getElementById('company-manager-count').innerText = companyData.managerCount ? `${companyData.managerCount}人` : '--';
      document.getElementById('company-nature').innerText = companyData.companyNature || '基金管理公司';
    } else {
      // Clear company values
      document.getElementById('company-name').innerText = fundData.company.name || '--';
      document.getElementById('company-ceo').innerText = '--';
      document.getElementById('company-establish-date').innerText = '--';
      document.getElementById('company-scale').innerText = '--';
      document.getElementById('company-fund-count').innerText = '--';
      document.getElementById('company-manager-count').innerText = '--';
      document.getElementById('company-nature').innerText = '基金公司';
    }

    // 6. Draw Dashboard overview chart
    if (fundData.scaleData && fundData.scaleData.categories && fundData.scaleData.categories.length > 0) {
      setTimeout(() => {
        initScaleChart(fundData.scaleData.categories, fundData.scaleData.series);
      }, 200);
    }
    
    // Draw Holdings distribution pie chart
    if (fundData.holdings && fundData.holdings.length > 0) {
      setTimeout(() => {
        initHoldingsPieChart(fundData.holdings);
      }, 200);
    }

    // Activate Dashboard Screen
    loadingPage.classList.remove('active');
    document.getElementById('dashboard-page').classList.add('active');

    if (pushToHistory && window.history && window.history.pushState) {
      const currentState = window.history.state;
      if (!currentState || currentState.page !== 'dashboard' || currentState.code !== code) {
        window.history.pushState({ page: 'dashboard', code: code }, '');
      }
    }
    
    // Reset Bottom navigation tabs active state to tab 1 (Overview)
    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelector('.bottom-nav .nav-item[data-tab="panel-overview"]').classList.add('active');
    document.querySelectorAll('.tab-panels .tab-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById('panel-overview').classList.add('active');

    // Preset active valuation model select value
    const valSelect = document.getElementById('val-model-select');
    if (valSelect) {
      valSelect.value = getPreferredModel();
    }

    // Update favorite button status
    const favorites = getFavorites();
    const isFav = favorites.some(item => item.code === fundData.code);
    updateFavoriteBtnUI(isFav);

    // 7. Start real-time updating
    startDashboardRealtime(fundData.holdings);

  } catch (err) {
    console.error(err);
    alert(err.message || '抓取基金数据失败，请检查网络或确认基金代码正确（必须是公募股票型/混合型基金才能获取持仓）');
    returnToSearch();
  }
}

// --- NEW CODE: WATCHLIST, MARKET TAB, AND ANALYSIS TOGGLES ---

// Return to search page helper
function returnToSearch() {
  stopDashboardRealtime();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('search-page').classList.add('active');
}

// Show search page from main page buttons
function showSearchPage(pushToHistory = true) {
  const shouldPush = (pushToHistory === true || typeof pushToHistory === 'object');
  if (shouldPush && window.history && window.history.pushState) {
    const currentState = window.history.state;
    if (!currentState || currentState.page !== 'search') {
      window.history.pushState({ page: 'search' }, '');
    }
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('search-page').classList.add('active');
  const keypadInput = document.getElementById('fund-code-input');
  if (keypadInput) {
    keypadInput.value = '';
    updateInputControls();
  }
}

const triggerBtn = document.getElementById('search-trigger-btn');
if (triggerBtn) triggerBtn.addEventListener('click', showSearchPage);

// Favorites (Watchlist) Management Helpers
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('fund_favorites') || '[]');
  } catch (e) {
    return [];
  }
}

function updateFavoriteBtnUI(isFav) {
  const favBtn = document.getElementById('dashboard-favorite-btn');
  if (!favBtn) return;
  const icon = favBtn.querySelector('i');
  if (icon) {
    if (isFav) {
      icon.className = 'fa-solid fa-star';
      icon.style.color = '#ffb800';
    } else {
      icon.className = 'fa-regular fa-star';
      icon.style.color = '';
    }
  }
}

function toggleFavorite(code, name) {
  let favorites = getFavorites();
  const idx = favorites.findIndex(item => item.code === code);
  let isFav = false;
  if (idx > -1) {
    favorites.splice(idx, 1);
    isFav = false;
  } else {
    favorites.push({ code, name });
    isFav = true;
  }
  localStorage.setItem('fund_favorites', JSON.stringify(favorites));
  updateFavoriteBtnUI(isFav);
}

// Bind favorite button click
const favBtn = document.getElementById('dashboard-favorite-btn');
if (favBtn) {
  favBtn.addEventListener('click', () => {
    if (currentFundData) {
      toggleFavorite(currentFundData.code, currentFundData.name);
    }
  });
}

// Render Watchlist
function renderWatchlist() {
  const container = document.getElementById('watchlist-items-container');
  if (!container) return;
  
  const favorites = getFavorites();
  const header = document.getElementById('watchlist-table-header');
  
  // If editing button clicked and favorites are empty, make sure edit mode is toggled off
  if (favorites.length === 0) {
    if (watchlistEditMode) {
      watchlistEditMode = false;
      const manageBtn = document.getElementById('watchlist-manage-btn');
      if (manageBtn) {
        manageBtn.innerHTML = '<i class="fa-solid fa-gear"></i> 管理';
        manageBtn.style.color = '';
      }
    }
    
    if (header) header.style.display = 'none';
    
    container.innerHTML = `
      <div class="watchlist-empty">
        <i class="fa-solid fa-star-half-stroke"></i>
        <p>暂无自选基金</p>
        <button class="watchlist-add-btn" id="watchlist-add-btn">立即添加</button>
      </div>
    `;
    const addBtn = document.getElementById('watchlist-add-btn');
    if (addBtn) addBtn.addEventListener('click', showSearchPage);
    return;
  }
  
  if (watchlistEditMode) {
    if (header) header.style.display = 'none';
  } else {
    if (header) header.style.display = 'flex';
  }
  
  container.innerHTML = '';
  if (watchlistEditMode) {
    container.classList.add('edit-mode');
  } else {
    container.classList.remove('edit-mode');
  }

  favorites.forEach((fav, index) => {
    const card = document.createElement('div');
    card.className = 'watchlist-item-card';
    card.setAttribute('data-code', fav.code);
    card.setAttribute('data-index', index);
    if (watchlistEditMode) {
      card.setAttribute('draggable', 'true');
    }
    
    card.addEventListener('click', (e) => {
      if (watchlistEditMode) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      queryFund(fav.code);
    });

    if (watchlistEditMode) {
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);
      
      // Touch drag-and-drop support for mobile/WebViews
      card.addEventListener('touchstart', handleTouchStart, { passive: false });
      card.addEventListener('touchmove', handleTouchMove, { passive: false });
      card.addEventListener('touchend', handleTouchEnd);
    }

    const info = document.createElement('div');
    info.className = 'wl-item-info';
    
    const name = document.createElement('span');
    name.className = 'wl-item-name';
    name.innerText = fav.name;
    
    const code = document.createElement('span');
    code.className = 'wl-item-code';
    code.innerText = fav.code;
    
    info.appendChild(name);
    info.appendChild(code);
    
    // 天天估值
    const officialCol = document.createElement('div');
    officialCol.className = 'wl-item-official-col';
    const officialVal = document.createElement('span');
    officialVal.className = 'wl-item-official-val';
    officialVal.innerText = '--';
    officialCol.appendChild(officialVal);

    // 自己估值
    const predCol = document.createElement('div');
    predCol.className = 'wl-item-pred-col';
    const predVal = document.createElement('span');
    predVal.className = 'wl-item-pred-val';
    predVal.innerText = '--';
    predCol.appendChild(predVal);

    // 最新涨跌
    const actualCol = document.createElement('div');
    actualCol.className = 'wl-item-actual-col';
    const actualVal = document.createElement('span');
    actualVal.className = 'wl-item-actual-val';
    actualVal.innerText = '--';
    const actualDate = document.createElement('span');
    actualDate.className = 'wl-item-actual-date';
    actualDate.innerText = '';
    actualCol.appendChild(actualVal);
    actualCol.appendChild(actualDate);
    
    const controls = document.createElement('div');
    controls.className = 'wl-item-controls';
    
    const upBtn = document.createElement('button');
    upBtn.className = 'wl-control-btn wl-up-btn';
    upBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    if (index === 0) upBtn.style.visibility = 'hidden';
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveWatchlistItem(index, -1);
    });
    
    const downBtn = document.createElement('button');
    downBtn.className = 'wl-control-btn wl-down-btn';
    downBtn.innerHTML = '<i class="fa-solid fa-arrow-down"></i>';
    if (index === favorites.length - 1) downBtn.style.visibility = 'hidden';
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveWatchlistItem(index, 1);
    });
    
    const delBtn = document.createElement('button');
    delBtn.className = 'wl-control-btn wl-delete-btn';
    delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWatchlistItem(index);
    });
    
    controls.appendChild(upBtn);
    controls.appendChild(downBtn);
    controls.appendChild(delBtn);
    
    card.appendChild(info);
    card.appendChild(officialCol);
    card.appendChild(predCol);
    card.appendChild(actualCol);
    card.appendChild(controls);
    container.appendChild(card);
    
    if (!watchlistEditMode) {
      loadWatchlistItemValuations(fav.code, officialVal, predVal, actualVal, actualDate);
    }
  });

}

function moveWatchlistItem(index, offset) {
  let favorites = getFavorites();
  const targetIndex = index + offset;
  if (targetIndex >= 0 && targetIndex < favorites.length) {
    const temp = favorites[index];
    favorites[index] = favorites[targetIndex];
    favorites[targetIndex] = temp;
    localStorage.setItem('fund_favorites', JSON.stringify(favorites));
    renderWatchlist();
  }
}

function deleteWatchlistItem(index) {
  let favorites = getFavorites();
  favorites.splice(index, 1);
  localStorage.setItem('fund_favorites', JSON.stringify(favorites));
  renderWatchlist();
}

let dragSrcIndex = null;

function handleDragStart(e) {
  dragSrcIndex = parseInt(this.getAttribute('data-index'));
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcIndex);
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  
  const targetIndex = parseInt(this.getAttribute('data-index'));
  if (dragSrcIndex !== null && dragSrcIndex !== targetIndex) {
    let favorites = getFavorites();
    const dragItem = favorites[dragSrcIndex];
    
    favorites.splice(dragSrcIndex, 1);
    favorites.splice(targetIndex, 0, dragItem);
    
    localStorage.setItem('fund_favorites', JSON.stringify(favorites));
    renderWatchlist();
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  dragSrcIndex = null;
}

// Touch event handlers for reordering watchlist items on mobile/WebViews
let touchDragCard = null;
let touchDragSrcIndex = null;

function handleTouchStart(e) {
  if (!watchlistEditMode) return;
  touchDragCard = this;
  touchDragSrcIndex = parseInt(this.getAttribute('data-index'));
  this.classList.add('dragging');
}

function handleTouchMove(e) {
  if (!watchlistEditMode || touchDragSrcIndex === null || !touchDragCard) return;
  
  // Prevent default scrolling behaviour when dragging
  e.preventDefault();
  
  const touch = e.touches[0];
  const touchX = touch.clientX;
  const touchY = touch.clientY;
  
  const elementUnderTouch = document.elementFromPoint(touchX, touchY);
  if (!elementUnderTouch) return;
  
  const targetCard = elementUnderTouch.closest('.watchlist-item-card');
  const container = document.getElementById('watchlist-items-container');
  if (targetCard && targetCard !== touchDragCard && container.contains(targetCard)) {
    const targetIndex = parseInt(targetCard.getAttribute('data-index'));
    if (!isNaN(targetIndex) && !isNaN(touchDragSrcIndex)) {
      // Visually swap in DOM tree without rebuilding
      if (touchDragSrcIndex < targetIndex) {
        targetCard.after(touchDragCard);
      } else {
        targetCard.before(touchDragCard);
      }
      
      // Update data-index attribute values on all cards in container
      const cards = container.getElementsByClassName('watchlist-item-card');
      Array.from(cards).forEach((c, idx) => {
        c.setAttribute('data-index', idx);
      });
      
      touchDragSrcIndex = targetIndex;
    }
  }
}

function handleTouchEnd(e) {
  if (!watchlistEditMode) return;
  
  if (touchDragCard) {
    touchDragCard.classList.remove('dragging');
  }
  
  if (touchDragSrcIndex !== null) {
    const container = document.getElementById('watchlist-items-container');
    const cards = container.getElementsByClassName('watchlist-item-card');
    
    // Read new visual order from DOM and update localStorage favorites list
    const favorites = getFavorites();
    const newFavorites = [];
    
    Array.from(cards).forEach(card => {
      const code = card.getAttribute('data-code');
      const favItem = favorites.find(f => f.code === code);
      if (favItem) {
        newFavorites.push(favItem);
      }
    });
    
    localStorage.setItem('fund_favorites', JSON.stringify(newFavorites));
    
    // Refresh/render watchlist to trigger clean up
    renderWatchlist();
  }
  
  touchDragCard = null;
  touchDragSrcIndex = null;
}

// Bind watchlist manage button click
const manageBtn = document.getElementById('watchlist-manage-btn');
if (manageBtn) {
  manageBtn.addEventListener('click', () => {
    watchlistEditMode = !watchlistEditMode;
    if (watchlistEditMode) {
      manageBtn.innerHTML = '<i class="fa-solid fa-check"></i> 完成';
      manageBtn.style.color = 'var(--accent-color)';
    } else {
      manageBtn.innerHTML = '<i class="fa-solid fa-gear"></i> 管理';
      manageBtn.style.color = '';
    }
    renderWatchlist();
  });
}

// Reusable valuation calculation logic
function calculateValuationForFund(fundData, prices, model = 'top10', indices = []) {
  let estimatedChangeSum = 0;
  let top10WeightSum = 0;
  
  if (!fundData.holdings || fundData.holdings.length === 0) {
    return 0;
  }
  
  fundData.holdings.forEach(stock => {
    const weightNum = parseFloat(stock.weight.replace('%', ''));
    top10WeightSum += weightNum;
    
    const priceInfo = prices[stock.code];
    if (priceInfo) {
      const changeRate = priceInfo.changePercent;
      estimatedChangeSum += (weightNum / 100) * changeRate;
    }
  });
  
  let stockPosition = 100;
  if (fundData.assetAllocation && fundData.assetAllocation.series) {
    const stockSeries = fundData.assetAllocation.series.find(s => s.name && s.name.includes('股票'));
    if (stockSeries && stockSeries.data && stockSeries.data.length > 0) {
      stockPosition = stockSeries.data[stockSeries.data.length - 1];
    }
  }
  
  let finalEstimatedChange = estimatedChangeSum;
  if (model === 'index') {
    let indexChange = 0;
    if (indices && indices.length > 0) {
      const csi300 = indices.find(idx => idx.code === 'sz399300' || idx.code === 's_sz399300');
      if (csi300) {
        indexChange = csi300.changePercent;
      } else if (indices[0]) {
        indexChange = indices[0].changePercent;
      }
    }
    if (stockPosition > top10WeightSum) {
      finalEstimatedChange = estimatedChangeSum + ((stockPosition - top10WeightSum) / 100) * indexChange;
    }
  }
  return finalEstimatedChange;
}

// Load background official valuation, prediction, and actual returns for watchlist items
async function loadWatchlistItemValuations(code, officialValEl, predValEl, actualValEl, actualDateEl) {
  // 1. Fetch Tiantian Official Valuation
  try {
    const res = await fetch(getApiUrl(`/api/fundgz/${code}`));
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    
    if (data && data.gszzl !== undefined) {
      const change = parseFloat(data.gszzl);
      if (!isNaN(change)) {
        officialValEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
        if (change > 0) {
          officialValEl.className = 'wl-item-official-val text-up';
        } else if (change < 0) {
          officialValEl.className = 'wl-item-official-val text-down';
        } else {
          officialValEl.className = 'wl-item-official-val text-flat';
        }
      } else {
        officialValEl.innerText = '0.00%';
        officialValEl.className = 'wl-item-official-val text-flat';
      }
    } else {
      officialValEl.innerText = '--';
      officialValEl.className = 'wl-item-official-val text-flat';
    }
  } catch (e) {
    console.error(`Failed to load official valuation for ${code}:`, e);
    officialValEl.innerText = '失败';
    officialValEl.className = 'wl-item-official-val text-flat';
  }

  // 2. Fetch fund details which contains holdings and netWorthTrend
  try {
    const fundRes = await fetch(getApiUrl(`/api/fund/${code}`));
    if (!fundRes.ok) throw new Error('API error');
    const fundData = await fundRes.json();

    // Display Actual Rise/Fall (Latest Net Asset Value Daily Return) and date
    if (fundData.netWorthTrend && fundData.netWorthTrend.length > 0) {
      const latestValObj = fundData.netWorthTrend[fundData.netWorthTrend.length - 1];
      const change = latestValObj.equityReturn;
      const dateVal = latestValObj.x;
      
      // Update actual value
      if (change !== undefined && change !== null && !isNaN(change)) {
        actualValEl.innerText = `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
        if (change > 0) {
          actualValEl.className = 'wl-item-actual-val text-up';
        } else if (change < 0) {
          actualValEl.className = 'wl-item-actual-val text-down';
        } else {
          actualValEl.className = 'wl-item-actual-val text-flat';
        }
      } else {
        actualValEl.innerText = '0.00%';
        actualValEl.className = 'wl-item-actual-val text-flat';
      }
      
      // Update actual date (MM-DD format)
      if (dateVal) {
        const jzDate = new Date(dateVal);
        const m = jzDate.getMonth() + 1;
        const d = jzDate.getDate();
        const mStr = m < 10 ? '0' + m : m;
        const dStr = d < 10 ? '0' + d : d;
        actualDateEl.innerText = `(${mStr}-${dStr})`;
      } else {
        actualDateEl.innerText = '';
      }
    } else {
      actualValEl.innerText = '--';
      actualValEl.className = 'wl-item-actual-val text-flat';
      actualDateEl.innerText = '';
    }

    // Fetch realtime stock prices and compute Prediction
    if (!fundData.holdings || fundData.holdings.length === 0) {
      predValEl.innerText = '0.00%';
      predValEl.className = 'wl-item-pred-val text-flat';
      return;
    }

    const stockCodes = fundData.holdings.map(h => h.code);
    const priceRes = await fetch(getApiUrl(`/api/realtime?stocks=${stockCodes.join(',')}`));
    if (!priceRes.ok) throw new Error('Realtime API error');
    const prices = await priceRes.json();

    const predChange = calculateValuationForFund(fundData, prices, getPreferredModel(), latestIndices);
    
    if (predChange !== undefined && predChange !== null && !isNaN(predChange)) {
      predValEl.innerText = `${predChange > 0 ? '+' : ''}${predChange.toFixed(2)}%`;
      if (predChange > 0) {
        predValEl.className = 'wl-item-pred-val text-up';
      } else if (predChange < 0) {
        predValEl.className = 'wl-item-pred-val text-down';
      } else {
        predValEl.className = 'wl-item-pred-val text-flat';
      }
    } else {
      predValEl.innerText = '0.00%';
      predValEl.className = 'wl-item-pred-val text-flat';
    }
  } catch (e) {
    console.error(`Failed to calculate background prediction for ${code}:`, e);
    actualValEl.innerText = '失败';
    actualValEl.className = 'wl-item-actual-val text-flat';
    actualDateEl.innerText = '';
    predValEl.innerText = '失败';
    predValEl.className = 'wl-item-pred-val text-flat';
  }
}

// Render Market Indices Tab
function renderMarketTab(indices) {
  const cnContainer = document.getElementById('market-cn-indices');
  const usContainer = document.getElementById('market-us-indices');
  if (!cnContainer || !usContainer) return;
  
  cnContainer.innerHTML = '';
  usContainer.innerHTML = '';
  
  indices.forEach(idx => {
    const card = document.createElement('div');
    card.className = 'market-index-card';
    
    const name = document.createElement('span');
    name.className = 'm-index-name';
    name.innerText = idx.name;
    
    const val = document.createElement('span');
    val.className = 'm-index-val';
    val.innerText = idx.value.toFixed(2);
    
    const badge = document.createElement('span');
    badge.className = 'm-index-badge';
    
    const rateVal = idx.changePercent;
    badge.innerText = `${rateVal > 0 ? '+' : ''}${rateVal.toFixed(2)}%`;
    
    if (rateVal > 0) {
      val.className = 'm-index-val text-up';
      badge.className = 'm-index-badge bg-up';
    } else if (rateVal < 0) {
      val.className = 'm-index-val text-down';
      badge.className = 'm-index-badge bg-down';
    } else {
      val.className = 'm-index-val text-flat';
      badge.className = 'm-index-badge bg-flat';
    }
    
    card.appendChild(name);
    card.appendChild(val);
    card.appendChild(badge);
    
    if (idx.code.startsWith('gb_')) {
      usContainer.appendChild(card);
    } else {
      cnContainer.appendChild(card);
    }
  });
}

// Bottom tab navigation switcher for main page
document.querySelectorAll('.main-bottom-nav .main-nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const tabId = item.getAttribute('data-main-tab');
    
    document.querySelectorAll('.main-bottom-nav .main-nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.main-tab-panels .main-tab-panel').forEach(panel => panel.classList.remove('active'));
    
    item.classList.add('active');
    const targetPanel = document.getElementById(tabId);
    if (targetPanel) {
      targetPanel.classList.add('active');
    }
    
    if (tabId === 'tab-watchlist') {
      renderWatchlist();
    } else if (tabId === 'tab-market') {
      if (latestIndices && latestIndices.length > 0) {
        renderMarketTab(latestIndices);
      } else {
        fetchIndices();
      }
    }
  });
});

// Three-dot Dropdown Menu next to Valuation display
const menuBtn = document.getElementById('valuation-more-btn');
const menuDropdown = document.getElementById('valuation-menu-dropdown');
if (menuBtn && menuDropdown) {
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('active');
  });
  
  document.addEventListener('click', () => {
    menuDropdown.classList.remove('active');
  });
}

// Populate Calculation Process Modal
function populateProcessModal() {
  if (!currentFundData || !currentPrices) return;
  
  const selectedModel = document.getElementById('val-model-select').value;
  const tableBody = document.getElementById('process-table-body');
  const formulaDesc = document.getElementById('process-formula-desc');
  const summaryDetails = document.getElementById('process-summary-details');
  
  if (!tableBody || !formulaDesc || !summaryDetails) return;
  
  tableBody.innerHTML = '';
  
  let estimatedChangeSum = 0;
  let top10WeightSum = 0;
  
  currentFundData.holdings.forEach(stock => {
    const weightNum = parseFloat(stock.weight.replace('%', ''));
    top10WeightSum += weightNum;
    
    const priceInfo = currentPrices[stock.code];
    let changeRate = 0;
    let contribVal = 0;
    
    if (priceInfo) {
      changeRate = priceInfo.changePercent;
      contribVal = (weightNum / 100) * changeRate;
      estimatedChangeSum += contribVal;
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${stock.name} (${stock.code})</td>
      <td>${stock.weight}</td>
      <td class="${changeRate > 0 ? 'text-up' : (changeRate < 0 ? 'text-down' : 'text-flat')}">${priceInfo ? (changeRate > 0 ? '+' : '') + changeRate.toFixed(2) + '%' : '--'}</td>
      <td class="${contribVal > 0 ? 'text-up' : (contribVal < 0 ? 'text-down' : 'text-flat')}">${priceInfo ? (contribVal > 0 ? '+' : '') + (contribVal * 100).toFixed(4) + '%' : '--'}</td>
    `;
    tableBody.appendChild(tr);
  });
  
  let stockPosition = 100;
  if (currentFundData.assetAllocation && currentFundData.assetAllocation.series) {
    const stockSeries = currentFundData.assetAllocation.series.find(s => s.name && s.name.includes('股票'));
    if (stockSeries && stockSeries.data && stockSeries.data.length > 0) {
      stockPosition = stockSeries.data[stockSeries.data.length - 1];
    }
  }
  
  let finalEstimatedChange = estimatedChangeSum;
  let explanation = '';
  let formulaHtml = '';
  
  if (selectedModel === 'index') {
    let indexChange = 0;
    let indexName = '沪深300指数';
    if (latestIndices && latestIndices.length > 0) {
      const csi300 = latestIndices.find(idx => idx.code === 'sz399300' || idx.code === 's_sz399300');
      if (csi300) {
        indexChange = csi300.changePercent;
      } else if (latestIndices[0]) {
        indexChange = latestIndices[0].changePercent;
        indexName = latestIndices[0].name;
      }
    }
    const remWeight = stockPosition > top10WeightSum ? (stockPosition - top10WeightSum) : 0;
    const indexContrib = (remWeight / 100) * indexChange;
    finalEstimatedChange = estimatedChangeSum + indexContrib;
    
    formulaHtml = `
      <strong>重仓+指数估值模型：</strong><br>
      公式：估值涨跌 = 前十大股贡献之和 + 剩余非重仓股票仓位 &times; 沪深300指数涨跌<br>
      在此模型下，我们使用主要股票指数（如沪深300）的当日涨跌幅来近似模拟未公开非重仓股的涨跌。
    `;
    
    explanation = `
      &bull; 前十大重仓股权重之和: <strong>${top10WeightSum.toFixed(2)}%</strong><br>
      &bull; 基金总股票仓位: <strong>${stockPosition.toFixed(2)}%</strong><br>
      &bull; 剩余非重仓仓位: ${stockPosition.toFixed(2)}% - ${top10WeightSum.toFixed(2)}% = <strong>${remWeight.toFixed(2)}%</strong><br>
      &bull; ${indexName}今日涨跌: <strong>${indexChange > 0 ? '+' : ''}${indexChange.toFixed(2)}%</strong><br>
      &bull; 剩余仓位指数贡献: ${remWeight.toFixed(2)}% &times; ${indexChange.toFixed(2)}% = <strong>${(indexContrib * 100).toFixed(4)}%</strong><br>
      &bull; 前十大股贡献之和: <strong>${(estimatedChangeSum * 100).toFixed(4)}%</strong><br>
      &bull; 最终估值结果: ${(estimatedChangeSum * 100).toFixed(4)}% + ${(indexContrib * 100).toFixed(4)}% = <strong>${(finalEstimatedChange * 100).toFixed(2)}%</strong>
    `;
  } else {
    formulaHtml = `
      <strong>仅重仓股估值模型：</strong><br>
      公式：估值涨跌 = 前十大股贡献之和<br>
      在此模型下，仅计算已披露的前十大重仓股票的涨跌贡献，其余非重仓和现金资产假定今日为0涨跌。
    `;
    
    explanation = `
      &bull; 前十大重仓股权重之和: <strong>${top10WeightSum.toFixed(2)}%</strong><br>
      &bull; 最终估值结果: <strong>${(finalEstimatedChange * 100).toFixed(2)}%</strong>
    `;
  }
  
  formulaDesc.innerHTML = formulaHtml;
  summaryDetails.innerHTML = explanation;
}

const showProcessBtn = document.getElementById('btn-show-process');
const processOverlay = document.getElementById('modal-process-overlay');
const closeProcessBtn = document.getElementById('btn-close-process-modal');

if (showProcessBtn && processOverlay) {
  showProcessBtn.addEventListener('click', () => {
    populateProcessModal();
    processOverlay.classList.add('active');
  });
}
if (closeProcessBtn && processOverlay) {
  closeProcessBtn.addEventListener('click', () => {
    processOverlay.classList.remove('active');
  });
}

// Populate Eastmoney Valuation Comparison Modal
async function populateCompareModal() {
  if (!currentFundData) return;
  
  const ourValPct = document.getElementById('comp-our-val');
  const officialValPct = document.getElementById('comp-official-val');
  const diffVal = document.getElementById('comp-diff-val');
  const officialTime = document.getElementById('comp-official-time');
  const officialDwjz = document.getElementById('comp-official-dwjz');
  const officialGsz = document.getElementById('comp-official-gsz');
  
  if (!ourValPct || !officialValPct || !diffVal || !officialTime || !officialDwjz || !officialGsz) return;
  
  const ourValText = document.getElementById('valuation-percentage').innerText;
  ourValPct.innerText = ourValText;
  
  officialValPct.innerText = '加载中...';
  diffVal.innerText = '--';
  officialTime.innerText = '正在获取...';
  officialDwjz.innerText = '正在获取...';
  officialGsz.innerText = '正在获取...';
  
  try {
    const res = await fetch(getApiUrl(`/api/fundgz/${currentFundData.code}`));
    if (!res.ok) throw new Error('API failure');
    const data = await res.json();
    
    const officialChange = parseFloat(data.gszzl || 0);
    officialValPct.innerText = `${officialChange > 0 ? '+' : ''}${officialChange.toFixed(2)}%`;
    
    if (officialChange > 0) {
      officialValPct.className = 'cv-val text-up';
    } else if (officialChange < 0) {
      officialValPct.className = 'cv-val text-down';
    } else {
      officialValPct.className = 'cv-val text-flat';
    }
    
    const ourChange = parseFloat(ourValText.replace('%', ''));
    const diff = ourChange - officialChange;
    diffVal.innerText = `${diff > 0 ? '+' : ''}${diff.toFixed(2)}%`;
    
    if (diff > 0) {
      diffVal.className = 'text-up';
    } else if (diff < 0) {
      diffVal.className = 'text-down';
    } else {
      diffVal.className = 'text-flat';
    }
    
    officialTime.innerText = data.gztime || '--';
    officialDwjz.innerText = `${data.dwjz || '--'} (截至 ${data.jzrq || ''})`;
    officialGsz.innerText = data.gsz || '--';
  } catch (e) {
    console.error('Failed to compare with official valuation:', e);
    officialValPct.innerText = '获取失败';
    officialValPct.className = 'cv-val text-flat';
    diffVal.innerText = '无法对比';
    diffVal.className = 'text-flat';
    officialTime.innerText = '接口返回异常';
    officialDwjz.innerText = '接口返回异常';
    officialGsz.innerText = '接口返回异常';
  }
}

const showCompareBtn = document.getElementById('btn-compare-official');
const compareOverlay = document.getElementById('modal-compare-overlay');
const closeCompareBtn = document.getElementById('btn-close-compare-modal');

if (showCompareBtn && compareOverlay) {
  showCompareBtn.addEventListener('click', () => {
    populateCompareModal();
    compareOverlay.classList.add('active');
  });
}
if (closeCompareBtn && compareOverlay) {
  closeCompareBtn.addEventListener('click', () => {
    compareOverlay.classList.remove('active');
  });
}

// Close Modals when clicking outer overlay area
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.remove('active');
    }
  });
});

// Preferred model getter helper
function getPreferredModel() {
  return localStorage.getItem('preferred_valuation_model') || 'top10';
}

// App Startup Initialization
renderWatchlist();

// Initialize history state on load
if (window.history && window.history.replaceState) {
  window.history.replaceState({ page: 'main' }, '');
}

// Navigation state handling
window.addEventListener('popstate', function(event) {
  const state = event.state || { page: 'main' };
  if (state.page === 'main') {
    stopDashboardRealtime();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('main-page').classList.add('active');
    renderWatchlist();
  } else if (state.page === 'search') {
    showSearchPage(false);
  } else if (state.page === 'dashboard' && state.code) {
    queryFund(state.code, false);
  }
});
