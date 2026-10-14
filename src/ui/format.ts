import { formatDate } from '../sim/calendar';

const money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const count = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat('en-IE', { notation: 'compact', maximumFractionDigits: 1 });

export const formatMoney = (value: number) => money.format(value);
/** An amount of money without the € sign, for next to a € icon. */
export const formatAmount = (value: number) => count.format(Math.round(value));
export const formatCount = (value: number) => count.format(value);
/** e.g. 1.2M, 340K */
export const formatCompact = (value: number) => compact.format(value);
export const formatPercent = (value: number) => `${Math.round(value * 100)}%`;
export const formatMonthYear = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1)).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
export { formatDate };
