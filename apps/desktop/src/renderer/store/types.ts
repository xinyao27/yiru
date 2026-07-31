/**
 * Slice implementations augment this leaf contract with their public state.
 * Keeping the contract import-free prevents AppState from depending back on
 * every implementation that consumes it.
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- Declaration merging requires an interface here.
export interface AppState {}
