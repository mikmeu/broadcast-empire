// Marketing campaigns and the promotion they build up.

import { MARKETING } from '../config/balance';
import { AUDIENCES, type AudienceId } from '../config/world';
import { spend, weeklyCost } from './economy';
import type { Desks } from './office';
import { effectiveSkill } from './staff';
import { techMultiplier } from './tech';
import { workFactor } from './upkeep';
import { addMessage, type Campaign, type CampaignAudience, type Employee, type GameState, type Id } from './state';

/**
 * Promotion a campaign builds per targeted audience: grows with the square root
 * of the budget and with the marketer's skill; "all audiences" is weaker per audience.
 */
export function campaignStrength(
  state: GameState,
  marketer: Employee,
  weeklyBudget: number,
  audience: CampaignAudience,
  desked: Desks,
): number {
  if (!desked.has(marketer.id)) return 0;
  return (
    MARKETING.maxPromotion *
    Math.sqrt(Math.min(1, weeklyBudget / MARKETING.fullBudget)) *
    (effectiveSkill(state, marketer, desked) / 100) *
    workFactor(state, marketer, desked) *
    (audience === 'all' ? MARKETING.allAudiences : 1) *
    techMultiplier(state, 'marketing')
  );
}

/** Promotion level a campaign pushes towards, per audience it targets. */
export function campaignTargets(state: GameState, campaign: Campaign, desked: Desks): Partial<Record<AudienceId, number>> {
  const marketer = state.employees.find((e) => e.id === campaign.marketerId);
  if (!marketer) return {};
  const strength = campaignStrength(state, marketer, campaign.weeklyBudget, campaign.audience, desked);
  if (campaign.audience === 'all') return Object.fromEntries(AUDIENCES.map((a) => [a.id, strength]));
  return { [campaign.audience]: strength };
}

export function campaignTargetName(state: GameState, targetId: Id): string {
  return state.channels.find((c) => c.id === targetId)?.name ?? state.shows.find((s) => s.id === targetId)?.name ?? 'A cancelled show';
}

/** Promotion for a show in its channel, per audience; capped at MARKETING.maxPromotion. */
export function promotionFor(state: GameState, ids: readonly Id[], audience: AudienceId): number {
  const total = ids.reduce((sum, id) => sum + (state.promotion[id]?.[audience] ?? 0), 0);
  return Math.min(MARKETING.maxPromotion, total);
}

/** Days before a campaign ends that the news says so, unless it repeats. */
export const CAMPAIGN_NOTICE_DAYS = 7;

/** Daily: pay for running campaigns, move promotion towards their targets, and let the rest fade. */
export function runCampaigns(draft: GameState, desked: Desks): void {
  const targets = new Map<Id, Partial<Record<AudienceId, number>>>();
  for (const campaign of draft.campaigns) {
    spend(draft, weeklyCost(draft, campaign.weeklyBudget) / 7, 'marketing');
    const levels = campaignTargets(draft, campaign, desked);
    const current = targets.get(campaign.targetId) ?? {};
    for (const [audience, level] of Object.entries(levels) as [AudienceId, number][]) {
      current[audience] = Math.max(current[audience] ?? 0, level);
    }
    targets.set(campaign.targetId, current);
  }

  const ids = new Set([...Object.keys(draft.promotion), ...targets.keys()]);
  for (const id of ids) {
    const levels = (draft.promotion[id] ??= {});
    for (const audience of AUDIENCES.map((a) => a.id)) {
      const level = levels[audience] ?? 0;
      const target = targets.get(id)?.[audience];
      const next = target !== undefined ? level + (target - level) * MARKETING.buildRate : level * (1 - MARKETING.fadeRate);
      if (next < 0.001) delete levels[audience];
      else levels[audience] = next;
    }
    if (Object.keys(levels).length === 0) delete draft.promotion[id];
  }

  for (const campaign of draft.campaigns) {
    const name = campaignTargetName(draft, campaign.targetId);
    const left = campaign.endDay - (draft.day + 1);
    if (left === CAMPAIGN_NOTICE_DAYS && !campaign.repeat) {
      addMessage(draft, 'info', `The campaign for “${name}” ends in a week. In Marketing it can be extended, or set to start again by itself.`, undefined, 'marketing');
    }
    if (left > 0) continue;
    // A campaign that repeats starts again at once, as long as the money is there for its first week.
    if (campaign.repeat && draft.money >= weeklyCost(draft, campaign.weeklyBudget)) {
      campaign.endDay += campaign.weeks * 7;
      continue;
    }
    addMessage(draft, 'info', `The campaign for “${name}” has ended${campaign.repeat ? ': there was not the money to start it again' : ''}; its effect will slowly fade.`, undefined, 'marketing');
  }
  draft.campaigns = draft.campaigns.filter((c) => draft.day + 1 < c.endDay);
}
