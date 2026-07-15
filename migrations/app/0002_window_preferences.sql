CREATE TABLE window_preferences (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  display_id TEXT NOT NULL,
  bounds_x_dip INTEGER NOT NULL,
  bounds_y_dip INTEGER NOT NULL,
  bounds_width_dip INTEGER NOT NULL CHECK (bounds_width_dip >= 320),
  bounds_height_dip INTEGER NOT NULL CHECK (bounds_height_dip >= 240),
  scale_factor REAL NOT NULL CHECK (scale_factor >= 0.5 AND scale_factor <= 8.0),
  maximized INTEGER NOT NULL CHECK (maximized IN (0, 1)),
  workspace_alignment TEXT NOT NULL CHECK (workspace_alignment IN ('center', 'left', 'right')),
  ui_scale_percent INTEGER NOT NULL CHECK (
    ui_scale_percent BETWEEN 90 AND 150 AND ui_scale_percent % 10 = 0
  ),
  body_font_size INTEGER NOT NULL CHECK (body_font_size BETWEEN 14 AND 28),
  content_width TEXT NOT NULL CHECK (content_width IN ('narrow', 'normal', 'wide', 'adaptive')),
  updated_at TEXT NOT NULL
) STRICT;
