package br.com.planilhamanel.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import org.json.JSONObject;
import java.util.ArrayList;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/** Online Android client: the hosted application remains the only source of financial data. */
public final class MainActivity extends Activity {
    private static final String APP_URL = "https://arbt-controle.aemonddesignmelhor.chatgpt.site/";
    private static final String APP_HOST = "arbt-controle.aemonddesignmelhor.chatgpt.site";
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorPanel;
    private boolean failed;
    private static final int VOICE_REQUEST = 902;
    private String voiceRequestId;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(21, 62, 51));
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((view, windowInsets) -> {
                Insets insets = windowInsets.getInsets(WindowInsets.Type.systemBars()
                    | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                return WindowInsets.CONSUMED;
            });
        } else {
            root.setFitsSystemWindows(true);
        }
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::onBackPressed);
        }

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(244, 246, 247));
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);

        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(28), dp(28), dp(28), dp(28));
        errorPanel.setBackgroundColor(Color.rgb(244, 246, 247));
        TextView title = new TextView(this);
        title.setText("Não foi possível abrir a Planilha Manel");
        title.setTextSize(23);
        title.setTextColor(Color.rgb(21, 62, 51));
        title.setGravity(Gravity.CENTER);
        errorPanel.addView(title);
        TextView description = new TextView(this);
        description.setText("Confira sua conexão com a internet e tente novamente. Seus registros continuam salvos no site.");
        description.setTextSize(16);
        description.setGravity(Gravity.CENTER);
        description.setPadding(0, dp(18), 0, dp(18));
        errorPanel.addView(description);
        Button retry = new Button(this);
        retry.setText("Tentar novamente");
        retry.setAllCaps(false);
        retry.setOnClickListener(view -> web.loadUrl(APP_URL));
        errorPanel.addView(retry);
        errorPanel.setVisibility(View.GONE);
        root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        FrameLayout.LayoutParams bar = new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP);
        root.addView(progress, bar);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                progress.setProgress(value);
                progress.setVisibility(value < 100 && !failed ? View.VISIBLE : View.GONE);
            }
            @Override public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
                new AlertDialog.Builder(MainActivity.this)
                    .setTitle("Sair desta tela?")
                    .setMessage("Alterações ainda não salvas podem ser perdidas.")
                    .setPositiveButton("Continuar", (dialog, which) -> result.confirm())
                    .setNegativeButton("Ficar", (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel()).show();
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if ("manel-voice".equals(request.getUrl().getScheme())) {
                    if (request.isForMainFrame() && request.hasGesture() && trustedPage()) {
                        startVoice(request.getUrl());
                    }
                    return true;
                }
                return openExternal(request.getUrl());
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternal(Uri.parse(url));
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                voiceRequestId = null;
                failed = false;
                errorPanel.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (!failed && trustedPage()) {
                    view.evaluateJavascript("window.ManelVoice={version:'1.1.0',start:function(id){window.location.href='manel-voice://start?request='+encodeURIComponent(id);}};window.dispatchEvent(new Event('manel-voice-ready'));", null);
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showError();
            }
            @Override public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                showError();
            }
        });
        // Do not persist form state or records in Android backups. Data is loaded from the same HTTPS site.
        web.loadUrl(APP_URL);
    }

    private boolean trustedPage() {
        if (web == null || web.getUrl() == null) return false;
        Uri uri = Uri.parse(web.getUrl());
        return "https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    private void startVoice(Uri uri) {
        String id = uri.getQueryParameter("request");
        if (!"start".equals(uri.getHost()) || id == null || !id.matches("[a-zA-Z0-9-]{1,80}") || voiceRequestId != null) return;
        voiceRequestId = id;
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Diga o evento ou os dados de uma aposta. Você pode continuar falando depois.");
        try {
            startActivityForResult(intent, VOICE_REQUEST);
        } catch (ActivityNotFoundException missing) {
            deliverVoice("", "O serviço de voz não está disponível neste aparelho. Use o microfone do teclado.");
        } catch (SecurityException denied) {
            deliverVoice("", "O serviço de voz não tem permissão para iniciar. Confira as permissões no Android.");
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != VOICE_REQUEST) return;
        ArrayList<String> results = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (resultCode == RESULT_OK && results != null && !results.isEmpty()) deliverVoice(results.get(0), "");
        else deliverVoice("", resultCode == RESULT_CANCELED ? "cancelled" : "Não foi possível reconhecer a fala. Tente novamente.");
    }

    private void deliverVoice(String text, String error) {
        String id = voiceRequestId;
        voiceRequestId = null;
        if (id == null || !trustedPage()) return;
        String detail = "{id:" + JSONObject.quote(id) + ",text:" + JSONObject.quote(text) + ",error:" + JSONObject.quote(error) + "}";
        web.evaluateJavascript("window.dispatchEvent(new CustomEvent('manel-voice-result',{detail:" + detail + "}));", null);
    }

    private void showError() {
        failed = true;
        progress.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private boolean openExternal(Uri uri) {
        if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443)) return false;
        if ("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme())) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
            } catch (ActivityNotFoundException unavailable) {
                Toast.makeText(this, "Não há navegador disponível para abrir este link.", Toast.LENGTH_LONG).show();
            }
        }
        return true;
    }

    @Override public void onBackPressed() {
        if (failed) { confirmExit(); return; }
        web.evaluateJavascript("(function(){var d=document.querySelector('[role=dialog]');if(!d)return false;var e=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true});(document.activeElement||d).dispatchEvent(e);return true;})()", result -> {
            if ("true".equals(result)) return;
            if (web.canGoBack()) web.goBack(); else confirmExit();
        });
    }

    private void confirmExit() {
        new AlertDialog.Builder(this).setTitle("Fechar a Planilha Manel?")
            .setMessage("Confira se salvou suas alterações antes de sair.")
            .setPositiveButton("Fechar", (dialog, which) -> finish())
            .setNegativeButton("Continuar usando", null).show();
    }

    @Override protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
        // No forced reload: returning from another app must not discard the current draft.
    }
    @Override protected void onDestroy() {
        if (web != null) {
            ((FrameLayout) web.getParent()).removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
}
