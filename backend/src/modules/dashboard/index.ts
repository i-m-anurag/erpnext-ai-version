export {
  registerDashboardResourceType,
  MODULE_DASHBOARD_RESOURCE_TYPE,
  dashboardSchema,
  type Dashboard,
  type DashboardWidget,
  type MetricSource,
} from './dashboard.schema.js';
export { buildDashboardRouter } from './dashboard.routes.js';
export { dashboardService, type ResolvedDashboard, type ResolvedWidget } from './dashboard.service.js';
