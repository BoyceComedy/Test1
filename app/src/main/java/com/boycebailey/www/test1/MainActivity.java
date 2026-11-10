package com.boycebailey.www.test1;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.support.v7.app.ActionBarActivity;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.CompoundButton;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Random;

/** Logo Tool: design a simple logo and export it as a PNG. */
public class MainActivity extends ActionBarActivity {

    private static final int EXPORT_SIZE = 1024;

    private static final int[] PALETTE = {
            0xFF000000, 0xFFFFFFFF, 0xFF3F51B5, 0xFF2196F3, 0xFF009688, 0xFF4CAF50,
            0xFFCDDC39, 0xFFFFC107, 0xFFFF9800, 0xFFFF5722, 0xFFF44336, 0xFFE91E63,
            0xFF9C27B0, 0xFF795548, 0xFF607D8B, 0xFF212121
    };

    private interface ColorTarget { void apply(int color); }

    private LogoView logo;
    private EditText editText;
    private EditText editTagline;
    private Spinner spinnerShape;
    private Spinner spinnerFont;
    private SeekBar seekSize;
    private CheckBox checkOutline;
    private final Random random = new Random();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        logo = (LogoView) findViewById(R.id.logo);
        editText = (EditText) findViewById(R.id.edit_text);
        editTagline = (EditText) findViewById(R.id.edit_tagline);
        spinnerShape = (Spinner) findViewById(R.id.spinner_shape);
        spinnerFont = (Spinner) findViewById(R.id.spinner_font);
        seekSize = (SeekBar) findViewById(R.id.seek_size);
        checkOutline = (CheckBox) findViewById(R.id.check_outline);

        editText.setText(logo.getText());
        editText.addTextChangedListener(new SimpleWatcher() {
            @Override public void afterTextChanged(Editable s) { logo.setText(s.toString()); }
        });
        editTagline.addTextChangedListener(new SimpleWatcher() {
            @Override public void afterTextChanged(Editable s) { logo.setTagline(s.toString()); }
        });

        setupSpinner(spinnerShape, LogoView.SHAPES, new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) { logo.setShape(pos); }
            @Override public void onNothingSelected(AdapterView<?> p) { }
        });
        setupSpinner(spinnerFont, LogoView.FONTS, new AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(AdapterView<?> p, View v, int pos, long id) { logo.setFont(pos); }
            @Override public void onNothingSelected(AdapterView<?> p) { }
        });

        checkOutline.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
            @Override public void onCheckedChanged(CompoundButton b, boolean checked) { logo.setOutline(checked); }
        });

        seekSize.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int progress, boolean fromUser) {
                logo.setTextScale(0.2f + progress / 100f); // 0.2 .. 0.8
            }
            @Override public void onStartTrackingTouch(SeekBar s) { }
            @Override public void onStopTrackingTouch(SeekBar s) { }
        });

        buildSwatches((LinearLayout) findViewById(R.id.swatches_shape), false, new ColorTarget() {
            @Override public void apply(int c) { logo.setShapeColor(c); }
        });
        buildSwatches((LinearLayout) findViewById(R.id.swatches_text), false, new ColorTarget() {
            @Override public void apply(int c) { logo.setTextColor(c); }
        });
        buildSwatches((LinearLayout) findViewById(R.id.swatches_bg), true, new ColorTarget() {
            @Override public void apply(int c) { logo.setLogoBackgroundColor(c); }
        });
    }

    private void setupSpinner(Spinner spinner, String[] items, AdapterView.OnItemSelectedListener l) {
        ArrayAdapter<String> adapter = new ArrayAdapter<String>(this,
                android.R.layout.simple_spinner_item, items);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        spinner.setOnItemSelectedListener(l);
    }

    private void buildSwatches(LinearLayout row, boolean includeTransparent, final ColorTarget target) {
        int size = (int) (40 * getResources().getDisplayMetrics().density);
        int margin = size / 8;
        int count = PALETTE.length + (includeTransparent ? 1 : 0);
        for (int i = 0; i < count; i++) {
            final int color = includeTransparent
                    ? (i == 0 ? Color.TRANSPARENT : PALETTE[i - 1])
                    : PALETTE[i];
            View swatch = new View(this);
            GradientDrawable d = new GradientDrawable();
            d.setShape(GradientDrawable.OVAL);
            d.setColor(color);
            d.setStroke(Math.max(1, margin / 2), color == Color.TRANSPARENT ? Color.RED : Color.GRAY);
            swatch.setBackgroundDrawable(d);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(size, size);
            lp.setMargins(margin, margin, margin, margin);
            swatch.setLayoutParams(lp);
            swatch.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { target.apply(color); }
            });
            row.addView(swatch);
        }
    }

    private void randomize() {
        spinnerShape.setSelection(random.nextInt(LogoView.SHAPES.length - 1)); // skip "None"
        spinnerFont.setSelection(random.nextInt(LogoView.FONTS.length));
        int shapeColor = PALETTE[2 + random.nextInt(PALETTE.length - 2)];
        logo.setShapeColor(shapeColor);
        logo.setTextColor(isLight(shapeColor) ? Color.BLACK : Color.WHITE);
        checkOutline.setChecked(random.nextInt(4) == 0);
        if (checkOutline.isChecked()) logo.setTextColor(shapeColor);
        seekSize.setProgress(15 + random.nextInt(30));
    }

    private static boolean isLight(int c) {
        double lum = 0.299 * Color.red(c) + 0.587 * Color.green(c) + 0.114 * Color.blue(c);
        return lum > 160;
    }

    /** Writes the logo to Pictures/LogoTool and returns the file, or null on failure. */
    private File exportPng() {
        File dir = new File(Environment.getExternalStoragePublicDirectory(
                Environment.DIRECTORY_PICTURES), "LogoTool");
        if (!dir.exists() && !dir.mkdirs()) {
            // Fall back to app-private external storage.
            dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES);
        }
        String base = logo.getText().replaceAll("[^A-Za-z0-9]", "");
        if (base.length() == 0) base = "logo";
        File file = new File(dir, base + "_" + System.currentTimeMillis() + ".png");

        Bitmap bmp = logo.toBitmap(EXPORT_SIZE);
        FileOutputStream out = null;
        try {
            out = new FileOutputStream(file);
            bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        } catch (IOException e) {
            Toast.makeText(this, getString(R.string.save_failed, e.getMessage()), Toast.LENGTH_LONG).show();
            return null;
        } finally {
            bmp.recycle();
            if (out != null) {
                try { out.close(); } catch (IOException ignored) { }
            }
        }
        MediaScannerConnection.scanFile(this, new String[]{file.getAbsolutePath()},
                new String[]{"image/png"}, null);
        return file;
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        getMenuInflater().inflate(R.menu.menu_main, menu);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == R.id.action_save) {
            File f = exportPng();
            if (f != null) {
                Toast.makeText(this, getString(R.string.saved_to, f.getAbsolutePath()), Toast.LENGTH_LONG).show();
            }
            return true;
        } else if (id == R.id.action_share) {
            File f = exportPng();
            if (f != null) {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("image/png");
                share.putExtra(Intent.EXTRA_STREAM, Uri.fromFile(f));
                startActivity(Intent.createChooser(share, getString(R.string.share_title)));
            }
            return true;
        } else if (id == R.id.action_randomize) {
            randomize();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    private abstract static class SimpleWatcher implements TextWatcher {
        @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
        @Override public void onTextChanged(CharSequence s, int start, int before, int count) { }
    }
}
