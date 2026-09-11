//! Filesystem path policy. Existing allowlist roots are required; an empty list denies all.
//! Resolves existing ancestors before permitting a new file. This is a desktop policy
//! check, not an OS sandbox against concurrent hostile filesystem mutation.
use std::path::{Component, Path, PathBuf};

pub struct PathValidator { allowed_dirs: Vec<PathBuf> }
impl PathValidator {
    pub fn new(allowed_dirs: Vec<String>) -> Self {
        Self { allowed_dirs: allowed_dirs.into_iter()
            .filter_map(|p| std::fs::canonicalize(p).ok())
            .filter(|p| p.is_dir()).collect() }
    }

    pub fn is_allowed(&self, path: &str) -> bool {
        let target = Path::new(path);
        if !target.is_absolute() || target.components().any(|c| matches!(c, Component::ParentDir)) {
            return false;
        }
        let mut ancestor = target;
        let mut missing = Vec::new();
        let resolved = loop {
            match std::fs::canonicalize(ancestor) {
                Ok(mut resolved) => {
                    for part in missing.iter().rev() { resolved.push(part); }
                    break resolved;
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    // A dangling symlink must never be treated as a new filename.
                    if std::fs::symlink_metadata(ancestor).is_ok() { return false; }
                    let Some(name) = ancestor.file_name() else { return false; };
                    missing.push(name.to_os_string());
                    let Some(parent) = ancestor.parent() else { return false; };
                    ancestor = parent;
                }
                Err(_) => return false,
            }
        };
        self.allowed_dirs.iter().any(|root| resolved.starts_with(root))
    }

    pub fn validate(&self, path: &str) -> Result<(), String> {
        if self.is_allowed(path) { Ok(()) }
        else { Err(format!("Path '{}' is outside the allowed directories", path)) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn denies_empty_and_missing_roots() {
        assert!(!PathValidator::new(vec![]).is_allowed("/etc/passwd"));
        assert!(!PathValidator::new(vec!["/nonexistent-root".into()]).is_allowed("/nonexistent-root/file"));
    }
    #[test]
    fn validates_existing_and_new_paths() {
        let temp = std::env::temp_dir().join(format!("scitrera-path-{}", std::process::id()));
        std::fs::create_dir_all(temp.join("allowed")).unwrap();
        std::fs::create_dir_all(temp.join("outside")).unwrap();
        let allowed = temp.join("allowed");
        let v = PathValidator::new(vec![allowed.to_string_lossy().into()]);
        assert!(v.is_allowed(allowed.join("new/sub/file").to_str().unwrap()));
        assert!(!v.is_allowed(allowed.join("../outside/file").to_str().unwrap()));
        assert!(!v.is_allowed(temp.join("allowed-prefix/file").to_str().unwrap()));
        assert!(!v.is_allowed("relative/file"));
        #[cfg(unix)] {
            std::os::unix::fs::symlink(temp.join("outside"), allowed.join("link")).unwrap();
            assert!(!v.is_allowed(allowed.join("link/new-file").to_str().unwrap()));
            std::os::unix::fs::symlink(temp.join("outside/missing"), allowed.join("dangling")).unwrap();
            assert!(!v.is_allowed(allowed.join("dangling").to_str().unwrap()));
        }
        std::fs::remove_dir_all(temp).unwrap();
    }
}
