#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|arg| arg == "--self-test") {
        if let Err(error) = codem_lib::run_self_test() {
            eprintln!("Codem self-test failed: {error}");
            std::process::exit(1);
        }
        println!("Codem self-test passed");
        return;
    }

    codem_lib::run();
}
