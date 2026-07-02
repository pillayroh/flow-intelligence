import * as vscode from "vscode";
import { Recorder } from "../recorder";
import { log } from "../logger";

// Minimal typing of the built-in Git extension API surface we use.
interface GitRepositoryState {
  HEAD?: { commit?: string };
  workingTreeChanges: unknown[];
  indexChanges: unknown[];
  onDidChange: vscode.Event<void>;
}
interface GitRepository {
  state: GitRepositoryState;
}
interface GitAPI {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
}

// Watches for new commits (HEAD commit hash changes) and records commit events
// with a count of changed files as a size proxy. No paths, diffs, or messages.
export function registerGit(recorder: Recorder): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  const gitExt = vscode.extensions.getExtension<{ getAPI(v: number): GitAPI }>("vscode.git");
  if (!gitExt) {
    log("git extension not found; skipping git signals");
    return disposables;
  }

  const setup = () => {
    const api = gitExt.exports.getAPI(1);
    const watch = (repo: GitRepository) => {
      let lastCommit = repo.state.HEAD?.commit;
      let pendingChanges =
        repo.state.workingTreeChanges.length + repo.state.indexChanges.length;
      disposables.push(
        repo.state.onDidChange(() => {
          pendingChanges = Math.max(
            pendingChanges,
            repo.state.workingTreeChanges.length + repo.state.indexChanges.length,
          );
          const head = repo.state.HEAD?.commit;
          if (head && head !== lastCommit) {
            recorder.record("git_commit", { changed_files: pendingChanges });
            lastCommit = head;
            pendingChanges = 0;
          }
        }),
      );
    };
    api.repositories.forEach(watch);
    disposables.push(api.onDidOpenRepository(watch));
  };

  if (gitExt.isActive) {
    setup();
  } else {
    gitExt.activate().then(setup, (err) => log(`git activate failed: ${String(err)}`));
  }

  return disposables;
}
