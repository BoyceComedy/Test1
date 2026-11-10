package com.boycebailey.www.test1;

import java.util.Random;

/**
 * Pure model for a "quarter circles grid": a rows x cols grid where every cell
 * is either empty or holds a quarter circle whose centre sits on one of the
 * cell's four corners. Neighbouring quarters that happen to face each other
 * merge visually into half and full circles.
 *
 * Kept free of Android classes so it can be reasoned about (and tested) on its own.
 */
public final class QuarterCircleGrid {

    public static final int EMPTY = -1;
    /** Circle centre at the cell's top-left corner; the arc bulges toward bottom-right. */
    public static final int TOP_LEFT = 0;
    public static final int TOP_RIGHT = 1;
    public static final int BOTTOM_RIGHT = 2;
    public static final int BOTTOM_LEFT = 3;

    private final int rows;
    private final int cols;
    private final int[] cells;

    public QuarterCircleGrid(int rows, int cols, float fillRatio, long seed) {
        if (rows <= 0 || cols <= 0) {
            throw new IllegalArgumentException("rows and cols must be positive");
        }
        this.rows = rows;
        this.cols = cols;
        this.cells = new int[rows * cols];

        Random random = new Random(seed);
        for (int i = 0; i < cells.length; i++) {
            cells[i] = random.nextFloat() < fillRatio ? random.nextInt(4) : EMPTY;
        }
    }

    public int getRows() {
        return rows;
    }

    public int getCols() {
        return cols;
    }

    /** Returns {@link #EMPTY} or one of the corner constants. */
    public int get(int row, int col) {
        return cells[row * cols + col];
    }
}
