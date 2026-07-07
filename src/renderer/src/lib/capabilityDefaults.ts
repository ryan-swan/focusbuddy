// Local snapshot of the capability defaults — used when there's no
// signed-in account (so we can't hit /account/capabilities) or while
// the first server fetch hasn't returned yet.
//
// Sync rule: when haptyx-shared/src/capabilities.ts updates, refresh
// this snapshot AND the parallel snapshot in
// projects/focusbuddy-signal/src/capabilities.ts. There's a drift test
// — keep the three in sync.

export type TierId = 'free' | 'pro' | 'team'
export type CapabilityValue = boolean | number | string

export const CAPABILITY_DEFAULTS: Record<string, Record<TierId, CapabilityValue>> = {
  product_desk:            { free: true,  pro: true,        team: true        },
  product_office:          { free: true,  pro: true,        team: true        },
  product_brain:           { free: true,  pro: true,        team: true        },
  product_people:          { free: true,  pro: true,        team: true        },
  office_docs:             { free: true,  pro: true,        team: true        },
  office_sheets:           { free: true,  pro: true,        team: true        },
  office_slides:           { free: true,  pro: true,        team: true        },
  office_draw:             { free: true,  pro: true,        team: true        },
  office_design:           { free: true,  pro: true,        team: true        },
  workspace_canvas:        { free: true,  pro: true,        team: true        },
  multiple_desks:          { free: 3,     pro: 'Unlimited', team: 'Unlimited' },
  desk_themes:             { free: true,  pro: true,        team: true        },
  edge_pan:                { free: true,  pro: true,        team: true        },
  widget_drag_drop:        { free: true,  pro: true,        team: true        },
  widget_resize_rotate:    { free: true,  pro: true,        team: true        },
  widget_sticky:           { free: true,  pro: true,        team: true        },
  widget_task_list:        { free: true,  pro: true,        team: true        },
  widget_files:            { free: true,  pro: true,        team: true        },
  widget_browser:          { free: true,  pro: true,        team: true        },
  widget_notes:            { free: true,  pro: true,        team: true        },
  widget_table:            { free: false, pro: true,        team: true        },
  widget_timer:            { free: true,  pro: true,        team: true        },
  widget_calendar:         { free: false, pro: true,        team: true        },
  task_creation:           { free: true,  pro: true,        team: true        },
  critical_step_highlight: { free: false, pro: true,        team: true        },
  ai_task_setup:           { free: false, pro: true,        team: true        },
  five_minute_lockin:      { free: true,  pro: true,        team: true        },
  extended_lockin:         { free: false, pro: true,        team: true        },
  drift_detection:         { free: false, pro: true,        team: true        },
  defer_to_later:          { free: true,  pro: true,        team: true        },
  resume_summary:          { free: false, pro: true,        team: true        },
  task_templates:          { free: false, pro: true,        team: true        },
  team_task_assignment:    { free: false, pro: false,       team: true        },
  speeddeck_universal:     { free: true,  pro: true,        team: true        },
  speeddeck_per_task:      { free: true,  pro: true,        team: true        },
  speeddeck_keystrokes:    { free: true,  pro: true,        team: true        },
  speeddeck_app_launch:    { free: true,  pro: true,        team: true        },
  speeddeck_url_open:      { free: true,  pro: true,        team: true        },
  speeddeck_multi_step:    { free: false, pro: true,        team: true        },
  speeddeck_ai_gen:        { free: false, pro: true,        team: true        },
  speeddeck_conflict:      { free: true,  pro: true,        team: true        },
  speeddeck_chords:        { free: false, pro: true,        team: true        },
  ai_chat:                 { free: true,  pro: true,        team: true        },
  byo_anthropic_key:       { free: true,  pro: true,        team: true        },
  ai_no_proxy:             { free: true,  pro: true,        team: true        },
  ai_task_breakdown:       { free: false, pro: true,        team: true        },
  ai_session_summary:      { free: false, pro: true,        team: true        },
  body_double:             { free: false, pro: true,        team: true        },
  ai_drift_prompts:        { free: false, pro: true,        team: true        },
  share_link_send:         { free: true,  pro: true,        team: true        },
  universal_share:         { free: false, pro: true,        team: true        },
  per_account_share:       { free: false, pro: true,        team: true        },
  cloud_inbox:             { free: false, pro: true,        team: true        },
  viewer_public_link:      { free: true,  pro: true,        team: true        },
  team_shared_decks:       { free: false, pro: false,       team: true        },
  local_first_storage:     { free: true,  pro: true,        team: true        },
  multi_device_sync:       { free: 1,     pro: 3,           team: 'Unlimited' },
  export_workspace:        { free: true,  pro: true,        team: true        },
  import_workspace:        { free: true,  pro: true,        team: true        },
  workspace_history:       { free: false, pro: true,        team: true        },
  master_password:         { free: true,  pro: true,        team: true        },
  no_telemetry:            { free: true,  pro: true,        team: true        },
  byo_key_only:            { free: true,  pro: true,        team: true        },
  two_factor:              { free: true,  pro: true,        team: true        },
  sso:                     { free: false, pro: false,       team: true        },
  session_audit:           { free: false, pro: true,        team: true        },
  marketplace_browse:      { free: true,  pro: true,        team: true        },
  marketplace_install_free:{ free: true,  pro: true,        team: true        },
  marketplace_purchase:    { free: true,  pro: true,        team: true        },
  marketplace_credits:     { free: false, pro: '$5/mo',     team: '$10/seat/mo' },
  marketplace_publish:     { free: false, pro: true,        team: true        },
  per_seat_billing:        { free: false, pro: false,       team: true        },
  centralized_admin:       { free: false, pro: false,       team: true        },
  usage_analytics:         { free: false, pro: false,       team: true        },
  capability_matrix_edit:  { free: false, pro: false,       team: true        },
  audit_log:               { free: false, pro: false,       team: true        },
  priority_support:        { free: false, pro: false,       team: true        },

  // ── 2.4.x — voice, imports, mind-map, focus-mode & linking widgets ──────
  // (kept in sync with haptyx-shared + signal-server via `check:drift`)
  widget_mindmap:          { free: true,  pro: true,        team: true        },
  widget_voice_recorder:   { free: true,  pro: true,        team: true        },
  widget_diagram:          { free: false, pro: true,        team: true        },
  widget_scratchpad:       { free: true,  pro: true,        team: true        },
  widget_focus_mode:       { free: true,  pro: true,        team: true        },
  widget_linking:          { free: true,  pro: true,        team: true        },
  widget_auto_arrange:     { free: false, pro: true,        team: true        },
  voice_command:           { free: true,  pro: true,        team: true        },
  voice_command_streaming: { free: false, pro: true,        team: true        },
  voice_command_silence:   { free: false, pro: true,        team: true        },
  voiceback:               { free: false, pro: true,        team: true        },
  whisper_cloud:           { free: true,  pro: true,        team: true        },
  whisper_local:           { free: false, pro: true,        team: true        },
  live_captions:           { free: true,  pro: true,        team: true        },
  mindmap_agents:          { free: false, pro: true,        team: true        },
  file_import_text:        { free: true,  pro: true,        team: true        },
  file_import_csv:         { free: false, pro: true,        team: true        },
  file_import_json:        { free: false, pro: true,        team: true        },
  file_import_docx:        { free: false, pro: true,        team: true        }
}

/** Resolve a capability value for a tier from the local defaults snapshot. */
export function localResolve(tier: TierId, key: string): CapabilityValue {
  const row = CAPABILITY_DEFAULTS[key]
  return row?.[tier] ?? false
}
