mod agent_host;
mod connections;
mod local_agentd;
mod machine_install;
mod machine_os;
mod machine_setup;
mod machines;
mod notification_setting;
mod remote_call;
mod ssh_config;
mod terminal;
mod window_icon;

use tauri::{Emitter, Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            app.manage(connections::Connections::new(app.handle().clone()));
            app.manage(window_icon::BigWindowIcon::default());
            app.manage(machines::MachineStore::default());
            let handle = app.handle().clone();
            app.manage(terminal::TerminalHost::new(move |event| {
                // A closed window has nobody left to show the output to.
                let _ = handle.emit(terminal::TERMINAL_EVENT, event);
            }));
            Ok(())
        })
        // Shells end with the window; none keeps running unseen.
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                window.state::<terminal::TerminalHost>().kill_all();
            }
        })
        .invoke_handler(tauri::generate_handler![
            agent_host::agentd_request,
            machines::list_machines,
            machines::machine_suggestions,
            machines::ssh_public_key,
            machines::add_machine,
            machines::remove_machine,
            machine_setup::test_machine,
            machine_install::install_agentd,
            notification_setting::notification_setting,
            terminal::terminal_shells,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_kill,
            terminal::terminal_kill_all,
            window_icon::set_window_icon
        ])
        .run(tauri::generate_context!())
        .expect("Bull failed to start");
}
