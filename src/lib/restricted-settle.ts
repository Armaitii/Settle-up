import type { SettlePlan, Transfer } from "./settle";

export type RestrictedPerson = {
  memberId: number;
  name: string;
  isSelf: boolean;
  netCents: number;
};

export type PairRestriction = {
  personAKey: string;
  personBKey: string;
};

function nameKey(name: string) {
  return name.trim().toLowerCase();
}

function pairKey(a: string, b: string) {
  const [first, second] = [nameKey(a), nameKey(b)].sort();
  return `${first}\u0000${second}`;
}

/**
 * Recalculates a combined settlement while never placing a payment directly
 * between a blocked pair. It first searches for the smallest direct allowed
 * plan. If that cannot be done, it routes money through a shortest eligible
 * intermediary path. A component whose net is not zero cannot be resolved
 * because restrictions isolate it from the rest of the people.
 */
export function simplifyWithRestrictions(
  people: RestrictedPerson[],
  rawObligationCount: number,
  restrictions: PairRestriction[],
): SettlePlan {
  const blocked = new Set(
    restrictions.map((restriction) =>
      pairKey(restriction.personAKey, restriction.personBKey),
    ),
  );
  const active = people.filter((person) => person.netCents !== 0);
  const base = {
    rawObligationCount,
    restrictionCount: restrictions.length,
    savedTransactions: 0,
  };

  if (active.length === 0) {
    return { ...base, transfers: [], transactionCount: 0, usesIntermediary: false };
  }

  const allowed = (a: RestrictedPerson, b: RestrictedPerson) =>
    a.memberId !== b.memberId && !blocked.has(pairKey(a.name, b.name));

  const components = buildComponents(people, allowed);
  for (const component of components) {
    const total = component.reduce((sum, person) => sum + person.netCents, 0);
    if (total !== 0) {
      return {
        ...base,
        transfers: [],
        transactionCount: 0,
        usesIntermediary: false,
        unresolvedMessage:
          "These restrictions isolate people whose balances do not cancel out. Remove a restriction or allow a route through another person.",
      };
    }
  }

  // A direct plan is preferable: it has no pass-through person. Exhaustive
  // search is bounded for normal-sized friend groups; larger workspaces use
  // a stable allowed greedy plan before considering routes.
  const direct = findDirectPlan(active, allowed);
  if (direct) {
    return {
      ...base,
      transfers: direct,
      transactionCount: direct.length,
      savedTransactions: Math.max(0, rawObligationCount - direct.length),
      usesIntermediary: false,
    };
  }

  const routed = routeThroughAllowedPaths(people, allowed);
  if (!routed) {
    return {
      ...base,
      transfers: [],
      transactionCount: 0,
      usesIntermediary: false,
      unresolvedMessage:
        "No allowed route can settle these balances. Remove a restriction or add someone who can act as an intermediary.",
    };
  }

  return {
    ...base,
    transfers: routed,
    transactionCount: routed.length,
    savedTransactions: Math.max(0, rawObligationCount - routed.length),
    usesIntermediary: true,
  };
}

function buildComponents(
  people: RestrictedPerson[],
  allowed: (a: RestrictedPerson, b: RestrictedPerson) => boolean,
) {
  const seen = new Set<number>();
  const components: RestrictedPerson[][] = [];
  for (const start of people) {
    if (seen.has(start.memberId)) continue;
    const component: RestrictedPerson[] = [];
    const queue = [start];
    seen.add(start.memberId);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (const next of people) {
        if (!seen.has(next.memberId) && allowed(current, next)) {
          seen.add(next.memberId);
          queue.push(next);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function findDirectPlan(
  people: RestrictedPerson[],
  allowed: (a: RestrictedPerson, b: RestrictedPerson) => boolean,
): Transfer[] | null {
  if (people.length > 14) return greedyDirectPlan(people, allowed);

  const remaining = people.map((person) => person.netCents);
  let best: Transfer[] | null = null;
  let attempts = 0;
  const MAX_ATTEMPTS = 50000;

  function visit(plan: Transfer[]) {
    attempts += 1;
    if (attempts > MAX_ATTEMPTS) return;
    if (best && plan.length >= best.length) return;

    const debtorIndex = chooseDebtor(people, remaining, allowed);
    if (debtorIndex < 0) {
      best = [...plan];
      return;
    }

    const debtor = people[debtorIndex];
    const targets = people
      .map((person, index) => ({ person, index }))
      .filter(({ person, index }) => remaining[index] > 0 && allowed(debtor, person))
      .sort((a, b) => remaining[b.index] - remaining[a.index] || a.person.memberId - b.person.memberId);

    for (const target of targets) {
      const amount = Math.min(-remaining[debtorIndex], remaining[target.index]);
      if (amount <= 0) continue;
      remaining[debtorIndex] += amount;
      remaining[target.index] -= amount;
      plan.push(asTransfer(debtor, target.person, amount));
      visit(plan);
      plan.pop();
      remaining[debtorIndex] -= amount;
      remaining[target.index] += amount;
      if (attempts > MAX_ATTEMPTS) break;
    }
  }

  visit([]);
  return best;
}

function chooseDebtor(
  people: RestrictedPerson[],
  remaining: number[],
  allowed: (a: RestrictedPerson, b: RestrictedPerson) => boolean,
) {
  const candidates = people
    .map((person, index) => ({ person, index }))
    .filter(({ index }) => remaining[index] < 0)
    .map(({ person, index }) => ({
      index,
      options: people.filter((target, targetIndex) => remaining[targetIndex] > 0 && allowed(person, target))
        .length,
    }))
    .sort((a, b) => a.options - b.options || remaining[a.index] - remaining[b.index]);
  return candidates[0]?.index ?? -1;
}

function greedyDirectPlan(
  people: RestrictedPerson[],
  allowed: (a: RestrictedPerson, b: RestrictedPerson) => boolean,
): Transfer[] | null {
  const remaining = people.map((person) => person.netCents);
  const result: Transfer[] = [];
  while (true) {
    const debtorIndex = chooseDebtor(people, remaining, allowed);
    if (debtorIndex < 0) return result;
    const debtor = people[debtorIndex];
    const targetIndex = people
      .map((person, index) => ({ person, index }))
      .filter(({ person, index }) => remaining[index] > 0 && allowed(debtor, person))
      .sort((a, b) => remaining[b.index] - remaining[a.index])[0]?.index;
    if (targetIndex == null) return null;
    const amount = Math.min(-remaining[debtorIndex], remaining[targetIndex]);
    remaining[debtorIndex] += amount;
    remaining[targetIndex] -= amount;
    result.push(asTransfer(debtor, people[targetIndex], amount));
  }
}

function routeThroughAllowedPaths(
  people: RestrictedPerson[],
  allowed: (a: RestrictedPerson, b: RestrictedPerson) => boolean,
): Transfer[] | null {
  const remaining = people.map((person) => person.netCents);
  const byId = new Map(people.map((person) => [person.memberId, person]));
  const flow = new Map<string, number>();

  while (true) {
    const debtorIndex = remaining.findIndex((value) => value < 0);
    if (debtorIndex < 0) break;
    const creditorIndexes = remaining
      .map((value, index) => ({ value, index }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.index - b.index);
    let selected: { index: number; path: number[] } | null = null;
    for (const candidate of creditorIndexes) {
      const path = shortestPath(people, debtorIndex, candidate.index, allowed);
      if (!path) continue;
      if (!selected || path.length < selected.path.length) {
        selected = { index: candidate.index, path };
      }
    }
    if (!selected) return null;

    const amount = Math.min(-remaining[debtorIndex], remaining[selected.index]);
    remaining[debtorIndex] += amount;
    remaining[selected.index] -= amount;
    for (let i = 0; i < selected.path.length - 1; i += 1) {
      addFlow(flow, people[selected.path[i]].memberId, people[selected.path[i + 1]].memberId, amount);
    }
  }

  const transfers: Transfer[] = [];
  for (const [key, amount] of flow) {
    if (amount <= 0) continue;
    const [fromRaw, toRaw] = key.split(":");
    const from = byId.get(Number(fromRaw));
    const to = byId.get(Number(toRaw));
    if (from && to) transfers.push(asTransfer(from, to, amount));
  }
  return transfers.sort((a, b) => b.amountCents - a.amountCents);
}

function shortestPath(
  people: RestrictedPerson[],
  start: number,
  end: number,
  allowed: (a: RestrictedPerson, b: RestrictedPerson) => boolean,
) {
  const previous = new Array<number>(people.length).fill(-1);
  const queue = [start];
  previous[start] = start;
  while (queue.length) {
    const current = queue.shift()!;
    if (current === end) break;
    for (let next = 0; next < people.length; next += 1) {
      if (previous[next] === -1 && allowed(people[current], people[next])) {
        previous[next] = current;
        queue.push(next);
      }
    }
  }
  if (previous[end] === -1) return null;
  const path = [end];
  while (path[0] !== start) path.unshift(previous[path[0]]);
  return path;
}

function addFlow(flow: Map<string, number>, from: number, to: number, amount: number) {
  const forward = `${from}:${to}`;
  const backward = `${to}:${from}`;
  const backwards = flow.get(backward) ?? 0;
  if (backwards >= amount) {
    flow.set(backward, backwards - amount);
  } else {
    flow.set(backward, 0);
    flow.set(forward, (flow.get(forward) ?? 0) + amount - backwards);
  }
}

function asTransfer(from: RestrictedPerson, to: RestrictedPerson, amountCents: number): Transfer {
  return {
    fromMemberId: from.memberId,
    fromName: from.name,
    fromIsSelf: from.isSelf,
    toMemberId: to.memberId,
    toName: to.name,
    toIsSelf: to.isSelf,
    amountCents,
  };
}
