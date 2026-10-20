package com.example.deliveryapp

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.webkit.WebResourceResponse
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = false
        webView.settings.allowContentAccess = false
        webView.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url
                val home = Uri.parse(BuildConfig.STOREFRONT_URL)
                val dashboard = target.path?.startsWith("/admin") == true || target.path?.startsWith("/accept-invite") == true
                if (target.scheme == home.scheme && target.host == home.host && target.port == home.port && !dashboard) return false
                if (target.scheme in listOf("https", "http", "tel", "mailto")) {
                    val intent = Intent(Intent.ACTION_VIEW, target)
                    try { startActivity(intent) } catch (_: android.content.ActivityNotFoundException) { }
                }
                return true
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                showConnectionError()
            }
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                if (request.isForMainFrame && errorResponse.statusCode >= 400) showConnectionError()
            }
        }
        ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
        showWebView()
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) webView.loadUrl(BuildConfig.STOREFRONT_URL)
    }
    private fun showConnectionError() {
                val layout = LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    setPadding(48, 100, 48, 48)
                }
                layout.addView(TextView(this@MainActivity).apply {
                    text = "Nuvora\n\nWe couldn't reach the kitchen. Check your connection and try again."
                    textSize = 22f
                })
                layout.addView(Button(this@MainActivity).apply {
                    text = "Try again"
                    setOnClickListener { showWebView(); webView.loadUrl(BuildConfig.STOREFRONT_URL) }
                })
                setContentView(layout)
    }
    private fun showWebView() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        setContentView(webView)
    }
    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }
    override fun onDestroy() {
        (webView.parent as? ViewGroup)?.removeView(webView)
        webView.destroy()
        super.onDestroy()
    }
}
