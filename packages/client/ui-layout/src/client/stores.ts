/**
 * Root-owned frame measurement, panel preferences, and presentation reports.
 * The registration supplies a fresh store and binds its actions to ctx.layout.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { MainPanelId } from './service.ts'
import {
  clampWidth, RIGHTBAR_DEFAULT_RATIO, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN,
  SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT, SIDEBAR_DRAWER_BREAKPOINT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'

/** One frame-wide preference: the wide sidebar's width, with 0 meaning closed. */
const SIDEBAR_PREFERENCE_KEY = 'dsh.layout.sidebar'

function readSidebarPreference(): number {
  if (typeof localStorage === 'undefined') return SIDEBAR_DEFAULT
  try {
    const raw = localStorage.getItem(SIDEBAR_PREFERENCE_KEY)
    if (raw === null) return SIDEBAR_DEFAULT
    const value = Number(raw)
    if (!Number.isFinite(value)) return SIDEBAR_DEFAULT
    return value === 0 ? 0 : clampWidth(value, SIDEBAR_MIN, SIDEBAR_MAX)
  } catch (error: unknown) {
    console.warn('layout sidebar preference could not be read:', error)
    return SIDEBAR_DEFAULT
  }
}

/**
 * Whether this profile has an explicit sidebar open/closed choice. The desktop
 * compact-start default applies only before such a choice exists.
 * @returns true when the persisted preference key is present.
 */
export function hasStoredSidebarPreference(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(SIDEBAR_PREFERENCE_KEY) !== null
  } catch (error: unknown) {
    console.warn('layout sidebar preference could not be read:', error)
    return false
  }
}

function rememberSidebarPreference(px: number): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(px))
  } catch (error: unknown) {
    console.warn('layout sidebar preference could not be saved:', error)
  }
}

/**
 * Frame layout preferences. The left sidebar's open state persists; responsive
 * concessions never rewrite widths, and the right panel's expanded state
 * belongs to its occupant.
 */
type LayoutState = {
  panelInfo: {
    /** Null selects the Conversation; global panels keep the current Session intact. */
    activePanelId: MainPanelId | null
  }
  layoutInfo: LayoutInfo
}

type LayoutInfo = {
  sidebar: number
  /** Last positive frame measurement; window width bootstraps the first render. */
  viewportWidth: number
  narrowExpanded: boolean
  /**
   * Saved right panel width in px, or null before its first opening. Resizing
   * the frame and closing the panel preserve this preference.
   */
  rightbar: number | null
  /**
   * Whether the right panel is drawn at all, in either presentation.
   *
   * Derived chrome, not a source of truth: whether the right surface is
   * expanded is a recorded fact owned by that surface, reported here so the
   * frame can place the panel's resize handle. The occupant reports it; nothing
   * else writes it.
   */
  rightbarShown: boolean
  /**
   * Whether the normal panel width reserves a grid track, including beneath
   * fullscreen. Reported by the occupant; always false while hidden.
   */
  rightbarTrack: boolean
  /** Reported fullscreen presentation; hides the outer resize handle. */
  rightbarFullscreen: boolean
  /** Suppress transitions for a fullscreen exit until another geometry action. */
  rightbarInstant: boolean
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type LayoutActions = {
  selectPanel: (draft: LayoutState, panelId: MainPanelId | null) => void
  retainMainPanels: (draft: LayoutState, panelIds: readonly string[]) => void
  setSidebar: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  /**
   * @param scaleRightbar - keep the right column's share of the frame: true
   *   while the file dock sits left of the conversation, where the conversation
   *   is the flexible column and must not absorb every window size change.
   */
  setViewportWidth: (draft: LayoutState, width: number, scaleRightbar?: boolean) => void
  setRightbar: (draft: LayoutState, px: number) => void
  openRightbar: (draft: LayoutState, track: boolean, fullscreen: boolean) => void
  closeRightbar: (draft: LayoutState) => void
}

/**
 * Create the layout panel store handle. For the sidebar the preference IS the
 * width, so closing it forgets its drag width — reopening restores the contract
 * default. The right panel initializes at 45% of the frame on first opening
 * and keeps that px preference across resizes and close. Drag writes clamp to
 * the current frame's range. Narrow sidebar toggles change only the expansion
 * override; opening the right panel clears that override.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>  {
  const handle = defineStore({
    init: (): LayoutState => ({
      panelInfo: { activePanelId: null },
      layoutInfo: {
        sidebar: readSidebarPreference(),
        viewportWidth: window.innerWidth,
        narrowExpanded: false,
        rightbar: null,
        rightbarShown: false,
        rightbarTrack: false,
        rightbarFullscreen: false,
        rightbarInstant: false,
      },
    }),
    actions: {
      selectPanel: (d, panelId: MainPanelId | null) => {
        d.panelInfo.activePanelId = panelId
        if (d.layoutInfo.viewportWidth < SIDEBAR_DRAWER_BREAKPOINT) d.layoutInfo.narrowExpanded = false
      },
      retainMainPanels: (d, panelIds: readonly string[]) => {
        if (d.panelInfo.activePanelId !== null && !panelIds.includes(d.panelInfo.activePanelId)) {
          d.panelInfo.activePanelId = null
        }
      },
      setSidebar: (d, px: number) => {
        d.layoutInfo.rightbarInstant = false
        d.layoutInfo.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX)
      },
      // Narrow toggles flip only the override: the width preference survives
      // untouched, so re-widening restores the pre-squeeze layout.
      toggleSidebar: (d) => {
        d.layoutInfo.rightbarInstant = false
        if (d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) d.layoutInfo.narrowExpanded = !d.layoutInfo.narrowExpanded
        else {
          d.layoutInfo.sidebar = d.layoutInfo.sidebar === 0 ? SIDEBAR_DEFAULT : 0
          rememberSidebarPreference(d.layoutInfo.sidebar)
        }
      },
      // Crossing the breakpoint in either direction drops the override: the
      // narrow default is auto-collapsed, the wide state is the preference.
      setViewportWidth: (d, width: number, scaleRightbar = false) => {
        const previous = d.layoutInfo.viewportWidth
        if (previous === width) return
        d.layoutInfo.rightbarInstant = false
        if ((previous < SIDEBAR_AUTO_COLLAPSE) !== (width < SIDEBAR_AUTO_COLLAPSE)
          || (previous < SIDEBAR_DRAWER_BREAKPOINT) !== (width < SIDEBAR_DRAWER_BREAKPOINT)) {
          d.layoutInfo.narrowExpanded = false
        }
        // The dock keeps the fraction of the frame it had before the resize;
        // the conversation, the remaining flexible column, scales with it
        // instead of taking the whole delta.
        if (scaleRightbar && d.layoutInfo.rightbar !== null && previous > 0) {
          d.layoutInfo.rightbar = clampWidth(
            d.layoutInfo.rightbar * width / previous,
            RIGHTBAR_MIN,
            Math.max(RIGHTBAR_MIN, width * RIGHTBAR_MAX_RATIO),
          )
        }
        d.layoutInfo.viewportWidth = width
      },
      setRightbar: (d, px: number) => {
        d.layoutInfo.rightbarInstant = false
        d.layoutInfo.rightbar = clampWidth(px, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO))
      },
      openRightbar: (d, track: boolean, fullscreen: boolean) => {
        if (!d.layoutInfo.rightbarShown || d.layoutInfo.rightbarTrack !== track || d.layoutInfo.rightbarFullscreen !== fullscreen) {
          d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen && !fullscreen
        }
        if (!d.layoutInfo.rightbarShown && d.layoutInfo.viewportWidth < SIDEBAR_AUTO_COLLAPSE) d.layoutInfo.narrowExpanded = false
        d.layoutInfo.rightbar ??= Math.max(RIGHTBAR_MIN, Math.round(d.layoutInfo.viewportWidth * RIGHTBAR_DEFAULT_RATIO))
        d.layoutInfo.rightbarShown = true
        d.layoutInfo.rightbarTrack = track
        d.layoutInfo.rightbarFullscreen = fullscreen
      },
      closeRightbar: (d) => {
        if (d.layoutInfo.rightbarShown) d.layoutInfo.rightbarInstant = d.layoutInfo.rightbarFullscreen
        d.layoutInfo.rightbarShown = false
        d.layoutInfo.rightbarTrack = false
        d.layoutInfo.rightbarFullscreen = false
      },
    },
  })
  return handle
}
