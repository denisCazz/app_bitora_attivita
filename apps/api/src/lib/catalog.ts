import { categoryChain, resolveCategory, type CategoryNode, type ModuleDefRow, type NeedRow, type ResolvedCategory } from "@rapportini/shared";
import { HttpError } from "../errors";
import { prisma } from "./prisma";

const TTL_MS = 15_000;

interface Snapshot {
  loadedAt: number;
  nodes: CategoryNode[];
  moduleDefs: ModuleDefRow[];
  needs: NeedRow[];
  resolved: Map<string, ResolvedCategory>;
}

let snapshot: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;
const tenantCategory = new Map<string, { categoryId: string; at: number }>();

async function load(): Promise<Snapshot> {
  const [categories, moduleDefs, needs] = await Promise.all([
    prisma.category.findMany({ include: { modules: true, roles: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    prisma.moduleDef.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.need.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
  ]);
  return { loadedAt: Date.now(), nodes: categories, moduleDefs, needs, resolved: new Map() };
}

async function current(): Promise<Snapshot> {
  if (snapshot && Date.now() - snapshot.loadedAt < TTL_MS) return snapshot;
  loading ??= load().finally(() => {
    loading = null;
  });
  snapshot = await loading;
  return snapshot;
}

export function invalidateCatalog() {
  snapshot = null;
  tenantCategory.clear();
}

export async function catalogNodes() {
  return (await current()).nodes;
}

export async function moduleDefinitions() {
  return (await current()).moduleDefs;
}

export async function needDefinitions() {
  return (await current()).needs;
}

export async function resolvedCategory(categoryId: string): Promise<ResolvedCategory> {
  const state = await current();
  const cached = state.resolved.get(categoryId);
  if (cached) return cached;
  const chain = categoryChain(state.nodes, categoryId);
  if (chain.length === 0) throw new HttpError(404, "Categoria non trovata");
  const resolved = resolveCategory(chain, state.moduleDefs, state.needs);
  state.resolved.set(categoryId, resolved);
  return resolved;
}

export async function categoryOfTenant(tenantId: string): Promise<ResolvedCategory> {
  const hit = tenantCategory.get(tenantId);
  let categoryId = hit && Date.now() - hit.at < TTL_MS ? hit.categoryId : null;
  if (!categoryId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { categoryId: true } });
    if (!tenant) throw new HttpError(404, "Negozio non trovato");
    categoryId = tenant.categoryId;
    tenantCategory.set(tenantId, { categoryId, at: Date.now() });
  }
  return resolvedCategory(categoryId);
}

export async function publicCategories() {
  const nodes = (await catalogNodes()).filter((node) => node.active);
  const resolved = await Promise.all(nodes.map((node) => resolvedCategory(node.id)));
  const view = (node: CategoryNode) => {
    const full = resolved.find((item) => item.id === node.id)!;
    return {
      id: node.id,
      key: node.key,
      label: node.label,
      description: node.description,
      icon: node.icon,
      accent: full.accent,
      image: full.image,
      ownImage: node.image,
    };
  };
  return nodes
    .filter((node) => !node.parentId)
    .map((root) => ({ ...view(root), children: nodes.filter((node) => node.parentId === root.id).map(view) }));
}

export async function publicPlan(categoryId: string) {
  const node = (await catalogNodes()).find((item) => item.id === categoryId);
  if (!node?.active) throw new HttpError(404, "Categoria non disponibile");
  const category = await resolvedCategory(categoryId);
  return {
    id: category.id,
    label: category.label,
    terminology: category.terminology,
    needs: category.needs,
    modules: category.modules.map((module) => ({
      key: module.key,
      label: module.label,
      description: module.description,
      pitch: module.pitch,
      icon: module.icon,
      priceCents: module.priceCents,
      trialDays: module.trialDays,
      requires: module.requires,
      free: module.free,
      recommended: module.recommended,
      sortOrder: module.sortOrder,
    })),
  };
}
