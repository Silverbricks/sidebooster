import { db } from "./db";

const attrSelect = { id: true, key: true, label: true, type: true, options: true, unit: true, required: true, isPrivate: true } as const;

export async function categoriesForForm() {
  return db.category.findMany({
    where: { parentId: null, active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, name: true, icon: true, highValue: true,
      attributes: { select: attrSelect, orderBy: { sortOrder: "asc" } },
      children: { where: { active: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, attributes: { select: attrSelect, orderBy: { sortOrder: "asc" } } } },
    },
  });
}
