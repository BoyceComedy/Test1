package com.boycebailey.www.test1;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.util.AttributeSet;
import android.view.View;

/**
 * Renders a simple logo: a background shape with a main mark (text/initials)
 * and an optional tagline underneath. Can also render itself to a Bitmap.
 */
public class LogoView extends View {

    public static final String[] SHAPES = {"Circle", "Rounded square", "Square", "Hexagon", "Diamond", "None"};
    public static final String[] FONTS = {"Sans bold", "Serif bold", "Monospace", "Sans light", "Serif italic"};

    private String text = "BB";
    private String tagline = "";
    private int shape = 0;
    private int font = 0;
    private int shapeColor = 0xFF3F51B5;
    private int textColor = Color.WHITE;
    private int backgroundColor = Color.TRANSPARENT;
    private float textScale = 0.5f;   // fraction of shape size
    private boolean outline = false;

    private final Paint shapePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint taglinePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final RectF rect = new RectF();

    public LogoView(Context context) { this(context, null); }

    public LogoView(Context context, AttributeSet attrs) {
        super(context, attrs);
        textPaint.setTextAlign(Paint.Align.CENTER);
        taglinePaint.setTextAlign(Paint.Align.CENTER);
        setLayerType(LAYER_TYPE_SOFTWARE, null);
    }

    public void setText(String t) { text = t == null ? "" : t; invalidate(); }
    public void setTagline(String t) { tagline = t == null ? "" : t; invalidate(); }
    public void setShape(int s) { shape = s; invalidate(); }
    public void setFont(int f) { font = f; invalidate(); }
    public void setShapeColor(int c) { shapeColor = c; invalidate(); }
    public void setTextColor(int c) { textColor = c; invalidate(); }
    public void setLogoBackgroundColor(int c) { backgroundColor = c; invalidate(); }
    public void setTextScale(float s) { textScale = s; invalidate(); }
    public void setOutline(boolean o) { outline = o; invalidate(); }

    public String getText() { return text; }

    @Override
    protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
        int w = MeasureSpec.getSize(widthMeasureSpec);
        setMeasuredDimension(w, w); // square preview
    }

    @Override
    protected void onDraw(Canvas canvas) {
        drawLogo(canvas, getWidth(), getHeight());
    }

    /** Renders the logo at the requested pixel size. */
    public Bitmap toBitmap(int size) {
        Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        drawLogo(new Canvas(bmp), size, size);
        return bmp;
    }

    private Typeface typeface() {
        switch (font) {
            case 1: return Typeface.create(Typeface.SERIF, Typeface.BOLD);
            case 2: return Typeface.create(Typeface.MONOSPACE, Typeface.BOLD);
            case 3: return Typeface.create("sans-serif-light", Typeface.NORMAL);
            case 4: return Typeface.create(Typeface.SERIF, Typeface.BOLD_ITALIC);
            default: return Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD);
        }
    }

    private void drawLogo(Canvas canvas, int w, int h) {
        if (backgroundColor != Color.TRANSPARENT) canvas.drawColor(backgroundColor);

        boolean hasTagline = tagline.trim().length() > 0;
        float size = Math.min(w, h) * (hasTagline ? 0.70f : 0.84f);
        float cx = w / 2f;
        float cy = hasTagline ? h * 0.42f : h / 2f;
        float r = size / 2f;

        shapePaint.setColor(shapeColor);
        shapePaint.setStyle(outline ? Paint.Style.STROKE : Paint.Style.FILL);
        shapePaint.setStrokeWidth(size * 0.05f);
        if (outline) r -= size * 0.025f;

        switch (shape) {
            case 0:
                canvas.drawCircle(cx, cy, r, shapePaint);
                break;
            case 1:
                rect.set(cx - r, cy - r, cx + r, cy + r);
                canvas.drawRoundRect(rect, r * 0.35f, r * 0.35f, shapePaint);
                break;
            case 2:
                rect.set(cx - r, cy - r, cx + r, cy + r);
                canvas.drawRect(rect, shapePaint);
                break;
            case 3:
                path.reset();
                for (int i = 0; i < 6; i++) {
                    double a = Math.toRadians(60 * i - 90);
                    float x = cx + (float) (r * Math.cos(a));
                    float y = cy + (float) (r * Math.sin(a));
                    if (i == 0) path.moveTo(x, y); else path.lineTo(x, y);
                }
                path.close();
                canvas.drawPath(path, shapePaint);
                break;
            case 4:
                path.reset();
                path.moveTo(cx, cy - r);
                path.lineTo(cx + r, cy);
                path.lineTo(cx, cy + r);
                path.lineTo(cx - r, cy);
                path.close();
                canvas.drawPath(path, shapePaint);
                break;
            default:
                break; // no shape
        }

        // Main mark, shrunk to fit inside the shape.
        textPaint.setTypeface(typeface());
        textPaint.setColor(textColor);
        float textSize = size * textScale;
        textPaint.setTextSize(textSize);
        float maxWidth = size * (shape == 4 ? 0.6f : 0.82f);
        float measured = textPaint.measureText(text);
        if (measured > maxWidth && measured > 0) {
            textSize *= maxWidth / measured;
            textPaint.setTextSize(textSize);
        }
        Paint.FontMetrics fm = textPaint.getFontMetrics();
        canvas.drawText(text, cx, cy - (fm.ascent + fm.descent) / 2f, textPaint);

        if (hasTagline) {
            taglinePaint.setTypeface(typeface());
            // Tagline uses the shape color so it stays readable on light backgrounds.
            taglinePaint.setColor(shapeColor);
            float ts = h * 0.08f;
            taglinePaint.setTextSize(ts);
            float tw = taglinePaint.measureText(tagline);
            if (tw > w * 0.9f) taglinePaint.setTextSize(ts * (w * 0.9f) / tw);
            canvas.drawText(tagline, cx, h * 0.92f, taglinePaint);
        }
    }
}
