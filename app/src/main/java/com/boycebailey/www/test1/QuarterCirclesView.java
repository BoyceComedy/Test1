package com.boycebailey.www.test1;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Bundle;
import android.os.Parcelable;
import android.util.AttributeSet;
import android.view.MotionEvent;
import android.view.View;

/**
 * Draws a {@link QuarterCircleGrid}. Tap the view to generate a new pattern.
 */
public class QuarterCirclesView extends View {

    private static final int GRID_SIZE = 16;
    private static final float FILL_RATIO = 0.6f;
    /** Gap between cells, as a fraction of the cell size. */
    private static final float GAP_RATIO = 0.04f;

    /**
     * Android measures arc angles clockwise from 3 o'clock (y grows downward).
     * Indexed by the corner constants in {@link QuarterCircleGrid}.
     */
    private static final float[] START_ANGLES = {
            0f,    // TOP_LEFT: quarter spans right -> down
            90f,   // TOP_RIGHT: down -> left
            180f,  // BOTTOM_RIGHT: left -> up
            270f,  // BOTTOM_LEFT: up -> right
    };

    private static final String KEY_SUPER = "super";
    private static final String KEY_SEED = "seed";

    private final Paint shapePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF oval = new RectF();

    private long seed;
    private QuarterCircleGrid grid;

    public QuarterCirclesView(Context context) {
        this(context, null);
    }

    public QuarterCirclesView(Context context, AttributeSet attrs) {
        super(context, attrs);
        shapePaint.setStyle(Paint.Style.FILL);
        shapePaint.setColor(getResources().getColor(R.color.qc_shape));
        setClickable(true);
        setContentDescription(context.getString(R.string.grid_description));
        setSeed(System.nanoTime());
    }

    /** Replaces the pattern with a freshly randomised one. */
    public void shuffle() {
        setSeed(System.nanoTime());
    }

    private void setSeed(long newSeed) {
        seed = newSeed;
        grid = new QuarterCircleGrid(GRID_SIZE, GRID_SIZE, FILL_RATIO, seed);
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);

        int availW = getWidth() - getPaddingLeft() - getPaddingRight();
        int availH = getHeight() - getPaddingTop() - getPaddingBottom();
        int rows = grid.getRows();
        int cols = grid.getCols();
        float cell = Math.min(availW / (float) cols, availH / (float) rows);
        if (cell <= 0f) {
            return;
        }

        // Centre the square grid inside the view.
        float left = getPaddingLeft() + (availW - cell * cols) / 2f;
        float top = getPaddingTop() + (availH - cell * rows) / 2f;
        float gap = Math.max(1f, cell * GAP_RATIO);
        float size = cell - gap;

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                int corner = grid.get(r, c);
                if (corner == QuarterCircleGrid.EMPTY) {
                    continue;
                }
                float x0 = left + c * cell + gap / 2f;
                float y0 = top + r * cell + gap / 2f;
                boolean leftEdge = corner == QuarterCircleGrid.TOP_LEFT
                        || corner == QuarterCircleGrid.BOTTOM_LEFT;
                boolean topEdge = corner == QuarterCircleGrid.TOP_LEFT
                        || corner == QuarterCircleGrid.TOP_RIGHT;
                float cx = leftEdge ? x0 : x0 + size;
                float cy = topEdge ? y0 : y0 + size;

                oval.set(cx - size, cy - size, cx + size, cy + size);
                canvas.drawArc(oval, START_ANGLES[corner], 90f, true, shapePaint);
            }
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        switch (event.getActionMasked()) {
            case MotionEvent.ACTION_DOWN:
                return true;
            case MotionEvent.ACTION_UP:
                performClick();
                return true;
            default:
                return super.onTouchEvent(event);
        }
    }

    @Override
    public boolean performClick() {
        super.performClick();
        shuffle();
        return true;
    }

    @Override
    protected Parcelable onSaveInstanceState() {
        Bundle state = new Bundle();
        state.putParcelable(KEY_SUPER, super.onSaveInstanceState());
        state.putLong(KEY_SEED, seed);
        return state;
    }

    @Override
    protected void onRestoreInstanceState(Parcelable state) {
        if (state instanceof Bundle) {
            Bundle bundle = (Bundle) state;
            super.onRestoreInstanceState(bundle.getParcelable(KEY_SUPER));
            setSeed(bundle.getLong(KEY_SEED));
        } else {
            super.onRestoreInstanceState(state);
        }
    }
}
