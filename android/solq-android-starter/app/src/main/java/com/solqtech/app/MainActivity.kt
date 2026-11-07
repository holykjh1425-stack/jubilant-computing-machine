package com.solqtech.app

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.*
import android.widget.*
import android.window.OnBackInvokedDispatcher

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var errorPanel: LinearLayout
    private var uploadCallback: ValueCallback<Array<Uri>>? = null
    private var mainFrameFailed = false
    private var retryUrl = HOME

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
            setOnApplyWindowInsetsListener { view, insets ->
                if (Build.VERSION.SDK_INT >= 30) {
                    val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                } else {
                    @Suppress("DEPRECATION")
                    view.setPadding(insets.systemWindowInsetLeft, insets.systemWindowInsetTop, insets.systemWindowInsetRight, insets.systemWindowInsetBottom)
                }
                insets
            }
        }
        val navigation = LinearLayout(this)
        fun action(label: Int, run: () -> Unit) {
            navigation.addView(Button(this).apply {
                setText(label)
                minHeight = (48 * resources.displayMetrics.density).toInt()
                setOnClickListener { run() }
            }, LinearLayout.LayoutParams(0, -2, 1f))
        }
        action(R.string.home) { webView.loadUrl(HOME) }
        action(R.string.refresh) { if (mainFrameFailed) webView.loadUrl(retryUrl) else webView.reload() }
        action(R.string.privacy) { webView.loadUrl(PRIVACY) }
        root.addView(navigation)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal)
        progress.contentDescription = getString(R.string.loading)
        root.addView(progress, LinearLayout.LayoutParams(-1, (4 * resources.displayMetrics.density).toInt()))
        errorPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 24, 24, 24)
            visibility = View.GONE
            addView(TextView(context).apply {
                setText(R.string.network_error)
                textSize = 18f
                accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
            })
            addView(Button(context).apply {
                setText(R.string.retry)
                setOnClickListener { webView.loadUrl(retryUrl) }
            })
        }
        root.addView(errorPanel)
        webView = WebView(this)
        root.addView(webView, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            safeBrowsingEnabled = true
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (isInternal(uri)) return false
                if (!request.isForMainFrame) return true
                // Only user-initiated links may leave. Never dispatch intent:, file: or javascript:.
                if (request.hasGesture() && uri.scheme?.lowercase() in setOf("https", "mailto", "tel", "sms", "geo")) {
                    try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE))
                    } catch (_: ActivityNotFoundException) {
                        Toast.makeText(this@MainActivity, R.string.no_handler, Toast.LENGTH_LONG).show()
                    }
                }
                return true
            }
            override fun onPageStarted(view: WebView, url: String, icon: android.graphics.Bitmap?) {
                mainFrameFailed = false
                retryUrl = url.takeIf { isInternal(Uri.parse(it)) } ?: HOME
                errorPanel.visibility = View.GONE
                webView.visibility = View.VISIBLE
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) showError()
            }
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (request.isForMainFrame && response.statusCode >= 400) showError()
            }
            // Platform SSL validation remains intact; never bypass certificate errors.
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, value: Int) {
                progress.progress = value
                progress.visibility = if (value == 100 || mainFrameFailed) View.GONE else View.VISIBLE
            }
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                if (!isInternal(Uri.parse(view.url ?: ""))) return false
                uploadCallback?.onReceiveValue(null)
                uploadCallback = callback
                val types = params.acceptTypes.filter { it.matches(Regex("[\\w.+*-]+/[\\w.+*-]+")) }
                val chooser = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = if (types.size == 1) types[0] else "*/*"
                    if (types.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, types.toTypedArray())
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                }
                try {
                    @Suppress("DEPRECATION")
                    startActivityForResult(chooser, UPLOAD_REQUEST)
                } catch (_: ActivityNotFoundException) {
                    uploadCallback = null
                    callback.onReceiveValue(null)
                    Toast.makeText(this@MainActivity, R.string.no_handler, Toast.LENGTH_LONG).show()
                }
                return true
            }
        }
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { navigateBack() }
        }
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) webView.loadUrl(HOME)
    }
    private fun showError() {
        mainFrameFailed = true
        webView.visibility = View.GONE
        progress.visibility = View.GONE
        errorPanel.visibility = View.VISIBLE
    }
    private fun navigateBack() { if (webView.canGoBack()) webView.goBack() else finish() }
    @Deprecated("Compatibility for Android 12 and earlier")
    override fun onBackPressed() = navigateBack()
    @Deprecated("Platform file picker result; no storage permission requested")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != UPLOAD_REQUEST) return
        val selected = if (resultCode == RESULT_OK) {
            val items = data?.clipData
            (if (items != null) (0 until items.itemCount).map { items.getItemAt(it).uri } else listOfNotNull(data?.data))
                .filter { it.scheme == "content" && it.authority != packageName }.distinct().toTypedArray()
        } else null
        uploadCallback?.onReceiveValue(selected?.takeIf { it.isNotEmpty() })
        uploadCallback = null
    }
    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }
    override fun onPause() { webView.onPause(); super.onPause() }
    override fun onResume() { super.onResume(); if (::webView.isInitialized) webView.onResume() }
    override fun onDestroy() {
        uploadCallback?.onReceiveValue(null)
        uploadCallback = null
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }
    companion object {
        private const val HOME = "https://solqtech.com/"
        private const val PRIVACY = "https://solqtech.com/privacy.html"
        private const val UPLOAD_REQUEST = 101
        internal fun isInternal(uri: Uri): Boolean = NavigationPolicy.isInternal(uri.toString())
    }
}
