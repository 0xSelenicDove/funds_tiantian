package com.tiantian.fundval

import android.os.Bundle
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.regex.Pattern

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        webView = WebView(this)
        webView.webChromeClient = android.webkit.WebChromeClient()
        setContentView(webView)

        // Configure WebView
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.allowContentAccess = true
        webView.settings.allowFileAccessFromFileURLs = true
        webView.settings.allowUniversalAccessFromFileURLs = true

        // Load local app resources
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url.toString()
                
                // Intercept APIs
                return when {
                    url.contains("/api/indices") -> {
                        val json = fetchIndices()
                        createJsonResponse(json)
                    }
                    url.contains("/api/realtime") -> {
                        val stocks = request?.url?.getQueryParameter("stocks") ?: ""
                        val json = fetchRealtime(stocks)
                        createJsonResponse(json)
                    }
                    url.contains("/api/fund/") -> {
                        val code = url.substringAfter("/api/fund/").take(6)
                        val json = fetchFundData(code)
                        createJsonResponse(json)
                    }
                    url.contains("/api/fundgz/") -> {
                        val code = url.substringAfter("/api/fundgz/").take(6)
                        val json = fetchOfficialValuation(code)
                        createJsonResponse(json)
                    }
                    url.contains("/api/company/") -> {
                        // Extract company ID
                        val parts = url.split("/api/company/")
                        val cid = if (parts.size > 1) parts[1].substringBefore("?").substringBefore("/") else ""
                        val json = fetchCompanyData(cid)
                        createJsonResponse(json)
                    }
                    else -> super.shouldInterceptRequest(view, request)
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                webView.evaluateJavascript(
                    """
                    (function() {
                        var favs = localStorage.getItem('fund_favorites');
                        if (!favs || !favs.includes('011370')) {
                            localStorage.setItem('fund_favorites', JSON.stringify([{"code": "000001", "name": "华夏成长混合"}, {"code": "011370", "name": "华商均衡成长混合C"}]));
                            if (window.renderWatchlist) {
                                window.renderWatchlist();
                            }
                        }
                    })()
                    """.trimIndent(), null
                )
            }
        }

        webView.loadUrl("file:///android_asset/www/index.html")
    }

    private fun createJsonResponse(json: String): WebResourceResponse {
        val response = WebResourceResponse(
            "application/json",
            "UTF-8",
            ByteArrayInputStream(json.toByteArray(Charsets.UTF_8))
        )
        response.responseHeaders = mapOf(
            "Access-Control-Allow-Origin" to "*",
            "Access-Control-Allow-Headers" to "*",
            "Access-Control-Allow-Methods" to "GET, POST, OPTIONS"
        )
        return response
    }

    // Helper: Network Fetcher
    private fun fetchUrl(urlStr: String, referer: String? = null, charset: String = "UTF-8"): String {
        return try {
            val url = URL(urlStr)
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36")
            if (referer != null) {
                conn.setRequestProperty("Referer", referer)
            }
            
            val stream = if (conn.responseCode >= 400) conn.errorStream else conn.inputStream
            val bytes = stream.readBytes()
            bytes.toString(charset(charset))
        } catch (e: Exception) {
            e.printStackTrace()
            ""
        }
    }

    // 1. Fetch indices natively
    private fun fetchIndices(): String {
        val raw = fetchUrl("http://hq.sinajs.cn/list=s_sh000001,s_sz399001,s_sz399006,s_sz399300,gb_dji,gb_ixic,gb_inx", "https://finance.sina.com.cn", "GBK")
        val lines = raw.split("\n")
        val sb = StringBuilder("[")
        var first = true

        for (line in lines) {
            val matcher = Pattern.compile("var\\s+hq_str_(s_)?(.*?)\\s*=\\s*\"(.*?)\";").matcher(line)
            if (matcher.find()) {
                val code = matcher.group(2) ?: ""
                val data = matcher.group(3) ?: ""
                val fields = data.split(",")
                if (fields.size >= 4) {
                    val name = when (code) {
                        "sh000001" -> "上证指数"
                        "sz399001" -> "深证成指"
                        "sz399006" -> "创业板指"
                        "sz399300" -> "沪深300"
                        "gb_dji" -> "道琼斯"
                        "gb_ixic" -> "纳斯达克"
                        "gb_inx" -> "标普500"
                        else -> fields[0]
                    }
                    val value: Double
                    val change: Double
                    val changePercent: Double

                    if (code.startsWith("gb_")) {
                        value = fields.getOrNull(1)?.toDoubleOrNull() ?: 0.0
                        change = fields.getOrNull(4)?.toDoubleOrNull() ?: 0.0
                        changePercent = fields.getOrNull(2)?.toDoubleOrNull() ?: 0.0
                    } else {
                        value = fields.getOrNull(1)?.toDoubleOrNull() ?: 0.0
                        change = fields.getOrNull(2)?.toDoubleOrNull() ?: 0.0
                        changePercent = fields.getOrNull(3)?.toDoubleOrNull() ?: 0.0
                    }

                    if (!first) sb.append(",")
                    first = false
                    sb.append(
                        """{"code":"$code","name":"$name","value":$value,"change":$change,"changePercent":$changePercent}"""
                    )
                }
            }
        }
        sb.append("]")
        return sb.toString()
    }

    // 1b. Fetch official fund valuation natively
    private fun fetchOfficialValuation(code: String): String {
        val raw = fetchUrl("http://fundgz.1234567.com.cn/js/$code.js")
        val matcher = Pattern.compile("jsonpgz\\(([\\s\\S]*?)\\);").matcher(raw)
        return if (matcher.find()) {
            matcher.group(1) ?: "{}"
        } else {
            "{}"
        }
    }

    // 2. Fetch realtime stock prices natively
    private fun fetchRealtime(stocks: String): String {
        if (stocks.isEmpty()) return "{}"
        
        val mappedCodes = stocks.split(",").map { code ->
            val codeStr = code.trim()
            when {
                codeStr.startsWith("sh", true) || codeStr.startsWith("sz", true) ||
                codeStr.startsWith("hk", true) || codeStr.startsWith("gb_", true) -> codeStr.lowercase()
                codeStr.length == 5 -> "hk$codeStr"
                codeStr.length == 6 -> {
                    if (codeStr.startsWith("6") || codeStr.startsWith("9") || codeStr.startsWith("5")) {
                        "sh$codeStr"
                    } else {
                        "sz$codeStr"
                    }
                }
                codeStr.length == 3 || codeStr.length == 4 -> "gb_${codeStr.lowercase()}"
                else -> codeStr.lowercase()
            }
        }

        val raw = fetchUrl("http://hq.sinajs.cn/list=${mappedCodes.joinToString(",")}", "https://finance.sina.com.cn", "GBK")
        val lines = raw.split("\n")
        val sb = StringBuilder("{")
        var first = true

        for (line in lines) {
            val matcher = Pattern.compile("var\\s+hq_str_(.*?)\\s*=\\s*\"(.*?)\";").matcher(line)
            if (matcher.find()) {
                val rawCode = matcher.group(1) ?: ""
                val data = matcher.group(2) ?: ""
                val fields = data.split(",")
                if (fields.size <= 1) continue

                val name: String
                val current: Double
                val yesterdayClose: Double
                var changePercent: Double

                if (rawCode.startsWith("hk")) {
                    name = fields.getOrNull(1) ?: ""
                    current = fields.getOrNull(6)?.toDoubleOrNull() ?: 0.0
                    yesterdayClose = fields.getOrNull(3)?.toDoubleOrNull() ?: 0.0
                    changePercent = fields.getOrNull(8)?.toDoubleOrNull() ?: 0.0
                    if (changePercent == 0.0 && yesterdayClose > 0.0) {
                        changePercent = ((current - yesterdayClose) / yesterdayClose) * 100.0
                    }
                } else if (rawCode.startsWith("gb_")) {
                    name = fields.getOrNull(0) ?: ""
                    current = fields.getOrNull(1)?.toDoubleOrNull() ?: 0.0
                    yesterdayClose = fields.getOrNull(26)?.toDoubleOrNull() ?: 0.0
                    changePercent = fields.getOrNull(2)?.toDoubleOrNull() ?: 0.0
                    if (changePercent == 0.0 && yesterdayClose > 0.0) {
                        changePercent = ((current - yesterdayClose) / yesterdayClose) * 100.0
                    }
                } else {
                    name = fields.getOrNull(0) ?: ""
                    current = fields.getOrNull(3)?.toDoubleOrNull() ?: 0.0
                    yesterdayClose = fields.getOrNull(2)?.toDoubleOrNull() ?: 0.0
                    changePercent = if (yesterdayClose > 0.0) {
                        ((current - yesterdayClose) / yesterdayClose) * 100.0
                    } else {
                        0.0
                    }
                }

                val cleanCode = rawCode.replace("^(sh|sz|hk|gb_)".toRegex(), "")
                
                if (!first) sb.append(",")
                first = false
                sb.append(
                    """"$cleanCode":{"rawCode":"$rawCode","name":"$name","current":$current,"yesterdayClose":$yesterdayClose,"changePercent":${String.format("%.2f", changePercent)}}"""
                )
            }
        }
        sb.append("}")
        return sb.toString()
    }

    // 3. Fetch company metadata natively
    private fun fetchCompanyData(cid: String): String {
        if (cid.isEmpty()) return "{}"
        
        val html = fetchUrl("http://fund.eastmoney.com/company/$cid.html")
        if (html.isEmpty()) return "{}"

        val managerMatch = Pattern.compile("总经理.*?&nbsp;(.*?)\\s*</p>", Pattern.DOTALL).matcher(html)
        val manager = if (managerMatch.find()) managerMatch.group(1)?.replace("<.*?>".toRegex(), "")?.replace("&nbsp;", "")?.trim() ?: "" else ""

        val addressMatch = Pattern.compile("办公地址:.*?\\s*(.*?)\\s*</p>", Pattern.DOTALL).matcher(html)
        val address = if (addressMatch.find()) addressMatch.group(1)?.replace("<.*?>".toRegex(), "")?.replace("&nbsp;", "")?.trim() ?: "" else ""

        val webMatch = Pattern.compile("网站地址:.*?\\s*(.*?)\\s*</p>", Pattern.DOTALL).matcher(html)
        val website = if (webMatch.find()) webMatch.group(1)?.replace("<.*?>".toRegex(), "")?.replace("&nbsp;", "")?.trim() ?: "" else ""

        val hotlineMatch = Pattern.compile("客服热线:.*?\\s*(.*?)\\s*</p>", Pattern.DOTALL).matcher(html)
        val hotline = if (hotlineMatch.find()) hotlineMatch.group(1)?.replace("<.*?>".toRegex(), "")?.replace("&nbsp;", "")?.trim() ?: "" else ""

        val scaleMatch = Pattern.compile("管理规模.*?</a>:\\s*<label class=\"grey\">(.*?)</label>", Pattern.CASE_INSENSITIVE).matcher(html)
        val scale = if (scaleMatch.find()) scaleMatch.group(1)?.replace("<.*?>".toRegex(), "")?.trim() ?: "" else ""

        val fundCountMatch = Pattern.compile("基金数量:\\s*<label class=\"grey\"><a[^>]*?>(\\d+)</a>只</label>", Pattern.CASE_INSENSITIVE).matcher(html)
        val fundCount = if (fundCountMatch.find()) fundCountMatch.group(1) ?: "" else ""

        val managerCountMatch = Pattern.compile("经理人数:\\s*<label class=\"grey\"><a[^>]*?>(\\d+)</a>人</label>", Pattern.CASE_INSENSITIVE).matcher(html)
        val managerCount = if (managerCountMatch.find()) managerCountMatch.group(1) ?: "" else ""

        val estDateMatch = Pattern.compile("成立日期:\\s*<label class=\"grey\">(.*?)</label>", Pattern.CASE_INSENSITIVE).matcher(html)
        val establishDate = if (estDateMatch.find()) estDateMatch.group(1)?.trim() ?: "" else ""

        val natureMatch = Pattern.compile("公司性质:\\s*<label class=\"grey\">(.*?)</label>", Pattern.CASE_INSENSITIVE).matcher(html)
        val companyNature = if (natureMatch.find()) natureMatch.group(1)?.trim() ?: "" else ""

        return """{
            "id": "$cid",
            "generalManager": "$manager",
            "address": "$address",
            "website": "$website",
            "hotline": "$hotline",
            "scale": "$scale",
            "fundCount": "$fundCount",
            "managerCount": "$managerCount",
            "establishDate": "$establishDate",
            "companyNature": "$companyNature"
        }""".replace("\n", " ").replace("\\s+".toRegex(), " ")
    }

    // 4. Fetch fund profile, managers, allocation, and holdings natively
    private fun fetchFundData(code: String): String {
        val jsText = fetchUrl("http://fund.eastmoney.com/pingzhongdata/$code.js", "http://fund.eastmoney.com/")
        if (jsText.isEmpty()) return "{}"

        val getJsVal = { varName: String ->
            val matcher = Pattern.compile("var\\s+$varName\\s*=\\s*\"(.*?)\";").matcher(jsText)
            if (matcher.find()) matcher.group(1) ?: "" else ""
        }

        val getRawJsVal = { varName: String ->
            val matcher = Pattern.compile("var\\s+$varName\\s*=\\s*([\\s\\S]*?);").matcher(jsText)
            if (matcher.find()) (matcher.group(1) ?: "").trim() else "null"
        }

        val fundName = getJsVal("fS_name")
        val fundCode = getJsVal("fS_code").ifEmpty { code }
        val syl1y = getJsVal("syl_1y")
        val syl3y = getJsVal("syl_3y")
        val syl6y = getJsVal("syl_6y")
        val syl1n = getJsVal("syl_1n")

        val managers = getRawJsVal("Data_currentFundManager")
        val scaleData = getRawJsVal("Data_fluctuationScale")
        val assetAllocation = getRawJsVal("Data_assetAllocation")
        val performanceEvaluation = getRawJsVal("Data_performanceEvaluation")
        val buyRedemption = getRawJsVal("Data_buySedemption")

        // Fetch basic profiles
        val jbgkHtml = fetchUrl("http://fundf10.eastmoney.com/jbgk_$code.html")
        val companyMatch = Pattern.compile("基金管理人.*?<a\\s+href=\"[^\"]*?company/(\\d+)\\.html\"[^>]*?>(.*?)</a>", Pattern.DOTALL).matcher(jbgkHtml)
        val companyId = if (companyMatch.find()) companyMatch.group(1) ?: "" else ""
        val companyName = if (companyMatch.find()) companyMatch.group(2) ?: "" else ""

        val extractJbgk = { label: String ->
            val matcher = Pattern.compile("<th>$label</th>\\s*<td[^>]*?>(.*?)</td>", Pattern.CASE_INSENSITIVE or Pattern.DOTALL).matcher(jbgkHtml)
            if (matcher.find()) {
                matcher.group(1)?.replace("<.*?>".toRegex(), "")?.replace("&nbsp;", " ")?.trim() ?: ""
            } else {
                val fallback = Pattern.compile("$label.*?<td[^>]*?>(.*?)</td>", Pattern.DOTALL).matcher(jbgkHtml)
                if (fallback.find()) {
                    fallback.group(1)?.replace("<.*?>".toRegex(), "")?.replace("&nbsp;", " ")?.trim() ?: ""
                } else ""
            }
        }

        val fundFullName = extractJbgk("基金全称")
        val fundType = extractJbgk("基金类型")
        val launchDate = extractJbgk("发行日期")
        val establishDate = extractJbgk("成立日期/规模")
        val custodian = extractJbgk("基金托管人")
        val mFee = extractJbgk("管理费率")
        val cFee = extractJbgk("托管费率")
        val benchmark = extractJbgk("业绩比较基准")

        val limitMatch = Pattern.compile("交易状态：([\\s\\S]*?)</label>").matcher(jbgkHtml)
        var limitBuy = "不限购"
        if (limitMatch.find()) {
            var raw = limitMatch.group(1) ?: ""
            raw = raw.replace("<.*?>".toRegex(), "")
            raw = raw.replace("&nbsp;", "")
            raw = raw.replace("\\s+".toRegex(), " ").trim()
            raw = raw.replace("(开放|暂停)赎回".toRegex(), "").trim()
            if (raw.isNotEmpty()) {
                limitBuy = raw.replace("\"", "\\\"")
            }
        }

        // Fetch holdings loop
        var years = listOf(java.util.Calendar.getInstance().get(java.util.Calendar.YEAR))
        val arryearMatch = Pattern.compile("arryear:\\[(.*?)\\]").matcher(jsText)
        if (arryearMatch.find()) {
            years = (arryearMatch.group(1) ?: "").split(",").mapNotNull { it.trim().toIntOrNull() }
        }

        var holdingsJson = "[]"
        var holdingsDate = ""

        for (year in years) {
            if (holdingsDate.isNotEmpty()) break
            for (month in listOf(12, 9, 6, 3)) {
                val hUrl = "http://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=$code&year=$year&month=$month"
                val hText = fetchUrl(hUrl, "http://fundf10.eastmoney.com/ccmx_$code.html")
                if (hText.isEmpty()) continue

                val contentMatch = Pattern.compile("content:\"(.*?)\",\\s*arryear", Pattern.DOTALL).matcher(hText)
                if (contentMatch.find()) {
                    val contentHtml = (contentMatch.group(1) ?: "")
                        .replace("\\\"", "\"")
                        .replace("\\\\/", "/")
                        .replace("\\/", "/")

                    val trMatches = Pattern.compile("<tr>(.*?)</tr>", Pattern.DOTALL).matcher(contentHtml)
                    val holdingsList = mutableListOf<String>()

                    while (trMatches.find()) {
                        val tr = trMatches.group(1) ?: ""
                        if (tr.contains("序号") || tr.contains("股票代码")) continue

                        val tdMatches = Pattern.compile("<td.*?>(.*?)</td>", Pattern.DOTALL).matcher(tr)
                        val tdVals = mutableListOf<String>()
                        while (tdMatches.find()) {
                            tdVals.add(tdMatches.group(1)?.replace("<.*?>".toRegex(), "")?.replace("&nbsp;", " ")?.trim() ?: "")
                        }

                        if (tdVals.size >= 6) {
                            val weight = tdVals.firstOrNull { it.endsWith("%") }
                            if (weight != null) {
                                val rank = tdVals.getOrNull(0) ?: ""
                                val stCode = tdVals.getOrNull(1) ?: ""
                                val name = tdVals.getOrNull(2) ?: ""
                                val idx = tdVals.indexOf(weight)
                                val shares = tdVals.getOrNull(idx + 1) ?: ""
                                val value = tdVals.getOrNull(idx + 2) ?: ""

                                holdingsList.add(
                                    """{"rank":"$rank","code":"$stCode","name":"$name","weight":"$weight","shares":"$shares","value":"$value"}"""
                                )
                            }
                        }
                    }

                    if (holdingsList.isNotEmpty()) {
                        holdingsJson = "[${holdingsList.joinToString(",")}]"
                        val dateMatch = Pattern.compile("截止至：<font class=['\"]px12['\"]>(.*?)</font>").matcher(contentHtml)
                        holdingsDate = if (dateMatch.find()) dateMatch.group(1) ?: "" else "$year-$month"
                        break
                    }
                }
            }
        }

        return """{
            "code": "$fundCode",
            "name": "$fundName",
            "fullName": "$fundFullName",
            "type": "$fundType",
            "launchDate": "$launchDate",
            "establishDate": "$establishDate",
            "custodian": "$custodian",
            "fees": {
                "management": "$mFee",
                "custody": "$cFee"
            },
            "benchmark": "$benchmark",
            "performance": {
                "month1": "$syl1y",
                "month3": "$syl3y",
                "month6": "$syl6y",
                "year1": "$syl1n"
            },
            "company": {
                "id": "$companyId",
                "name": "$companyName"
            },
            "managers": $managers,
            "scaleData": $scaleData,
            "assetAllocation": $assetAllocation,
            "performanceEvaluation": $performanceEvaluation,
            "buyRedemption": $buyRedemption,
            "holdings": $holdingsJson,
            "holdingsDate": "$holdingsDate",
            "limitBuy": "$limitBuy"
        }""".replace("\n", " ").replace("\\s+".toRegex(), " ")
    }
}
