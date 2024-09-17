use chrono::Local;
use colored::*;
use env_logger::{Builder, Env};
use log::info;
use log::LevelFilter;
use std::io::Write;
use warp::log::Info;

static EXCLUDED_PATHS: &[&str] = &["/_next", "/readmemory"];
static EXCLUDED_EXTENSIONS: &[&str] = &[
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".bmp", ".tiff",
];

pub fn init_log() {
    Builder::new()
        .format(|buf, record| {
            let level = record.level();
            let (level_string, level_color) = match level {
                log::Level::Error => ("ERROR", Color::Red),
                log::Level::Warn => ("WARN ", Color::Yellow),
                log::Level::Info => ("INFO ", Color::Green),
                log::Level::Debug => ("DEBUG", Color::Blue),
                log::Level::Trace => ("TRACE", Color::Magenta),
            };

            let args = record.args().to_string();
            let colored_args = if args.contains("GET")
                || args.contains("POST")
                || args.contains("PUT")
                || args.contains("DELETE")
            {
                let parts: Vec<&str> = args.splitn(3, ' ').collect();
                if parts.len() == 3 {
                    format!(
                        "{} {} {}",
                        parts[0].color(Color::Cyan),
                        parts[1].color(Color::Yellow),
                        parts[2]
                    )
                } else {
                    args
                }
            } else {
                args
            };

            writeln!(
                buf,
                "{} [{}] {}",
                Local::now()
                    .format("%H:%M:%S")
                    .to_string()
                    .color(Color::White),
                level_string.color(level_color),
                colored_args
            )
        })
        .filter_level(LevelFilter::Info)
        .parse_env(Env::default().default_filter_or("info"))
        .init();
}

pub fn http_log(info: Info) {
    if EXCLUDED_PATHS
        .iter()
        .any(|prefix| info.path().starts_with(prefix))
    {
        return;
    }
    if EXCLUDED_EXTENSIONS
        .iter()
        .any(|ext| info.path().ends_with(ext))
    {
        return;
    }

    info!(
        "{} {} {} {}ms",
        info.method(),
        info.path(),
        info.status(),
        info.elapsed().as_millis(),
    );
}
