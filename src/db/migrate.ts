import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { getDb } from "./index";
import { seed } from "./seed";

const db = getDb();
migrate(db, { migrationsFolder: "./drizzle" });
seed(db);
console.log("Migraciones aplicadas y categorias iniciales creadas.");
