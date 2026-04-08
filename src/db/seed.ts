import type { Db } from "./index";
import { categories } from "./schema";

const DEFAULT_CATEGORIES = [
  { group: "Servicios", name: "Internet" },
  { group: "Servicios", name: "Telefono" },
  { group: "Servicios", name: "Electricidad" },
  { group: "Servicios", name: "Gas" },
  { group: "Servicios", name: "Agua" },
  { group: "Servicios", name: "Television/Streaming" },
  { group: "Servicios", name: "Otros servicios" },
  { group: "Ocio y transporte", name: "Restaurantes" },
  { group: "Ocio y transporte", name: "Hotel" },
  { group: "Ocio y transporte", name: "Transporte publico" },
  { group: "Ocio y transporte", name: "Taxi/App" },
  { group: "Ocio y transporte", name: "Espectaculos" },
  { group: "Ocio y transporte", name: "Gasolina" },
  { group: "Ocio y transporte", name: "Estacionamiento/Peaje" },
  { group: "Ocio y transporte", name: "Entretenimiento" },
  { group: "Salud y deporte", name: "Farmacia" },
  { group: "Salud y deporte", name: "Medico" },
  { group: "Salud y deporte", name: "Deporte/Gym" },
  { group: "Salud y deporte", name: "Educacion" },
  { group: "Salud y deporte", name: "Belleza" },
  { group: "Vivienda", name: "Arriendo" },
  { group: "Vivienda", name: "Dividendo/Hipoteca" },
  { group: "Vivienda", name: "Gastos comunes" },
  { group: "Vivienda", name: "Mantenimiento hogar" },
  { group: "Vivienda", name: "Mantenimiento vehiculo" },
  { group: "Seguros", name: "Seguro auto" },
  { group: "Seguros", name: "Seguro hogar" },
  { group: "Seguros", name: "Seguro salud" },
  { group: "Seguros", name: "Seguro vida" },
  { group: "Seguros", name: "Otro seguro" },
  { group: "Compras", name: "Supermercado" },
  { group: "Compras", name: "Ropa" },
  { group: "Compras", name: "Electronica" },
  { group: "Compras", name: "Hogar/Deco" },
  { group: "Compras", name: "Regalos" },
  { group: "Compras", name: "Otras compras" },
  { group: "Bancos", name: "Comisiones bancarias" },
  { group: "Bancos", name: "Impuestos" },
  { group: "Bancos", name: "Prestamos" },
  { group: "Bancos", name: "Multas" },
  { group: "Ingresos", name: "Sueldo" },
  { group: "Ingresos", name: "Freelance/Honorarios" },
  { group: "Ingresos", name: "Inversiones" },
  { group: "Ingresos", name: "Otros ingresos" },
  { group: "Transferencias", name: "Transferencia a terceros" },
  { group: "Transferencias", name: "Pago entre cuentas", excludeFromSummary: true },
  { group: "Otros", name: "Otros" },
] as const;

export function seed(db: Db): void {
  for (const cat of DEFAULT_CATEGORIES) {
    db.insert(categories)
      .values({
        name: cat.name,
        group: cat.group,
        excludeFromSummary: "excludeFromSummary" in cat ? true : false,
      })
      .onConflictDoNothing()
      .run();
  }
}

export const CATEGORY_COUNT = DEFAULT_CATEGORIES.length;

if (import.meta.main) {
  const { getDb } = await import("./index");
  getDb();
  console.log("Categorias iniciales creadas.");
}
