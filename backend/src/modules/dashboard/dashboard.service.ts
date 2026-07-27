import { configResolver } from '../config/index.js';
import { metricsService, type WidgetData } from './metrics.service.js';
import { MODULE_DASHBOARD_RESOURCE_TYPE, type Dashboard, type DashboardWidget } from './dashboard.schema.js';

export interface ResolvedWidget extends DashboardWidget {
  data: WidgetData | null;
  /** Set when a widget's data couldn't be resolved (bad field, missing master). */
  error?: string;
}

export interface ResolvedDashboard {
  slug: string;
  widgets: ResolvedWidget[];
}

/**
 * Resolves a module's dashboard: load the seeded widget config, then run each
 * widget's metric source and attach its data — one round-trip for the whole board.
 * A widget whose data fails to resolve is returned with an `error` rather than
 * failing the entire dashboard, so one bad config line can't blank the page.
 */
export const dashboardService = {
  async forModule(module: string): Promise<ResolvedDashboard> {
    // No dashboard configured for this module → an empty board, not an error.
    const resolved = await configResolver
      .resolve<Dashboard>(MODULE_DASHBOARD_RESOURCE_TYPE, module)
      .catch(() => null);
    if (!resolved) return { slug: module, widgets: [] };
    const { definition } = resolved;
    const widgets = await Promise.all(
      definition.widgets.map(async (w): Promise<ResolvedWidget> => {
        try {
          return { ...w, data: await metricsService.resolveSource(w.source) };
        } catch (err) {
          return { ...w, data: null, error: err instanceof Error ? err.message : 'failed to resolve' };
        }
      }),
    );
    return { slug: definition.slug, widgets };
  },
};
