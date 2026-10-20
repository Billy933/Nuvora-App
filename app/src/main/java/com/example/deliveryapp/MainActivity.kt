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
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

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
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = request.url
                val home = Uri.parse(BuildConfig.STOREFRONT_URL)
                if (target.scheme == home.scheme && target.host == home.host && target.port == home.port && target.path?.startsWith("/admin") != true) return false
                if (target.scheme in listOf("https", "http", "tel", "mailto")) {
                    val intent = Intent(Intent.ACTION_VIEW, target)
                    if (intent.resolveActivity(packageManager) != null) startActivity(intent)
                }
                return true
            }
            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
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
        }
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack() else finish()
            }
        })
        showWebView()
        if (savedInstanceState == null) webView.loadUrl(BuildConfig.STOREFRONT_URL)
        else webView.restoreState(savedInstanceState)
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
