use std::fs;
use std::path::PathBuf;

/// 将文本内容写入用户通过原生保存对话框选定的路径。
/// 用于"导出/分享"功能：浏览器端走 `<a download>`，Tauri 桌面端走此命令保证可靠落盘。
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
  fs::write(PathBuf::from(&path), content)
    .map_err(|e| format!("写入文件失败: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![write_text_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
