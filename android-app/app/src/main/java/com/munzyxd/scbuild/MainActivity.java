package com.munzyxd.scbuild;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Typeface;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(32, 32, 32, 32);
        root.setBackgroundColor(0xFFF5F7FA);

        TextView title = new TextView(this);
        title.setText("SC BUILD ANDROID");
        title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        title.setTextColor(0xFF172554);
        title.setGravity(Gravity.CENTER);

        TextView subtitle = new TextView(this);
        subtitle.setText("Project Android berhasil dijalankan.\nAPK dibuat melalui GitHub Actions.");
        subtitle.setTextSize(16);
        subtitle.setTextColor(0xFF475569);
        subtitle.setGravity(Gravity.CENTER);
        subtitle.setPadding(0, 18, 0, 0);

        root.addView(title);
        root.addView(subtitle);
        setContentView(root);
    }
}
