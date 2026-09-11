/**
 * Office ribbon command function file.
 * Associates ribbon button actions with their implementations.
 *
 * The "Show Sidebar" ribbon button in each manifest calls showSidebar,
 * which opens the task pane if it is not already visible.
 */

Office.onReady(() => {
  // Associate the ribbon action name with the handler function.
  // The action name must match the <Action FunctionName="..."> in the manifest.
  if (Office.actions && typeof Office.actions.associate === 'function') {
    Office.actions.associate('showSidebar', showSidebar);
  }
});

/**
 * Opens (or focuses) the Scitrera AI task pane.
 * The task pane's source URL is defined in the manifest DefaultSettings.
 */
function showSidebar(event: Office.AddinCommands.Event): void {
  // For task-pane show commands, Office handles opening the task pane
  // automatically via the manifest's ShowTaskpane action type.
  // This function is a no-op placeholder that satisfies the FunctionFile
  // requirement for ExecuteFunction-type buttons (if any are added later).
  event.completed();
}
