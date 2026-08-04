import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { defaultChecklist, GATES, ESTIMATED_HEALTH_DIMENSIONS } from '../common/domain';
import { Brand } from '../entities/brand.entity';
import { GateReview } from '../entities/gate-review.entity';

export type FgtItem = {
  item_no: string;
  description: string;
  brand_code: string;
  unit_price: number;
  inventory: number;
  customer_price?: number;
  discount_percent?: number;
  final_price_incl_vat?: number;
  colisage?: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fournit l'accès au catalogue FGT et aux agrégats de stock par marque.
 * Gère le cache court, le mode mock et la synchronisation avec les marques de pilotage.
 */
@Injectable()
export class CatalogService {
  private cache: { at: number; raw: Record<string, unknown>[]; source: string } | null = null;
  /** Source réellement utilisée pour la dernière lecture (api | mock | mock-fallback). */
  private lastSource = 'mock';

  /**
   * Injecte la configuration applicative et les dépôts TypeORM nécessaires à la synchronisation.
   */
  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(GateReview) private readonly gates: Repository<GateReview>,
  ) {}

  /** Retourne la source catalogue effective (utile pour l'UI / healthcheck). */
  getDataSourceLabel(): string {
    return this.lastSource || this.config.get('DATA_SOURCE') || 'api';
  }

  private mockRaw(): Record<string, unknown>[] {
    return [
      {
        ItemNo: 'ART-1001',
        Description: 'Huile olive 1L',
        Marque: 'OLIVA',
        FinalPrice: 42,
        Stock: 120,
        CustomerPrice: 48,
        DiscountPercent: 5,
        FinalPriceInclVAT: 50.4,
        Colisage: 12,
      },
      {
        ItemNo: 'ART-1002',
        Description: 'Huile olive 5L',
        Marque: 'OLIVA',
        FinalPrice: 180,
        Stock: 40,
        CustomerPrice: 195,
        DiscountPercent: 0,
        FinalPriceInclVAT: 216,
        Colisage: 4,
      },
      {
        ItemNo: 'ART-2001',
        Description: 'Biscuits multi-céréales',
        Marque: 'BAUDUCCO',
        FinalPrice: 18,
        Stock: 0,
        CustomerPrice: 22,
        DiscountPercent: 10,
        FinalPriceInclVAT: 21.6,
        Colisage: 24,
      },
      {
        ItemNo: 'ART-2002',
        Description: 'Gâteau cacao',
        Marque: 'BAUDUCCO',
        FinalPrice: 25,
        Stock: 85,
        CustomerPrice: 29,
        DiscountPercent: 0,
        FinalPriceInclVAT: 30,
        Colisage: 12,
      },
      {
        ItemNo: 'ART-3001',
        Description: 'Thé vert 100s',
        Marque: 'DEMO',
        FinalPrice: 35,
        Stock: 200,
        CustomerPrice: 40,
        DiscountPercent: 0,
        FinalPriceInclVAT: 42,
        Colisage: 10,
      },
    ];
  }

  private async fetchRaw(force = false): Promise<Record<string, unknown>[]> {
    if (!force && this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      this.lastSource = this.cache.source;
      return this.cache.raw;
    }

    const configured = (this.config.get('DATA_SOURCE') || 'api').toLowerCase();
    let raw: Record<string, unknown>[];
    let source = configured;

    if (configured === 'mock') {
      raw = this.mockRaw();
      source = 'mock';
    } else {
      try {
        const base = this.config.get('FGT_API_BASE_URL') || 'http://192.168.1.125:7691';
        // Réseau privé / LAN → ne pas bloquer Railway/Vercel
        const host = new URL(base).hostname;
        const isPrivate =
          host === 'localhost' ||
          host === '127.0.0.1' ||
          host.startsWith('192.168.') ||
          host.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
        if (isPrivate && process.env.NODE_ENV === 'production') {
          console.warn(`[catalog] Private FGT host ${host} in production → mock`);
          raw = this.mockRaw();
          source = 'mock-fallback';
        } else {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          let res: Response;
          try {
            res = await fetch(`${base.replace(/\/$/, '')}/api/articleList`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                customerNo: this.config.get('FGT_CUSTOMER_NO') || 'CA000500',
                typeDoc: this.config.get('FGT_TYPE_DOC') || 'VENTE',
              }),
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }
          if (!res.ok) throw new Error(`FGT API error ${res.status}`);
          const data = (await res.json()) as {
            success?: boolean;
            ArticleList?: string | { Items: unknown[] };
          };
          if (!data.success) throw new Error('FGT API success=false');
          let articleList = data.ArticleList;
          if (typeof articleList === 'string') articleList = JSON.parse(articleList);
          raw = ((articleList as { Items?: Record<string, unknown>[] })?.Items || []) as Record<
            string,
            unknown
          >[];
          source = 'api';
        }
      } catch (err) {
        // Cloud (Railway) ne peut pas joindre l'API LAN FGT → catalogue de démo
        console.warn(
          `[catalog] FGT API unreachable, fallback mock: ${err instanceof Error ? err.message : err}`,
        );
        raw = this.mockRaw();
        source = 'mock-fallback';
      }
    }

    this.lastSource = source;
    this.cache = { at: Date.now(), raw, source };
    return raw;
  }
  /**
   * Liste les articles FGT normalisés depuis l'API ou le mode mock.
   * Peut filtrer par marque et forcer le rafraîchissement du cache.
   */
  async listItems(brand?: string, force = false): Promise<FgtItem[]> {
    const raw = await this.fetchRaw(force);
    return raw
      .map((row) => {
        const brandCode = String(row.Marque || 'UNKNOWN').trim();
        return {
          item_no: String(row.ItemNo || ''),
          description: String(row.Description || ''),
          brand_code: brandCode,
          unit_price: Number(row.FinalPrice ?? row.UnitPrice ?? 0),
          inventory: Number(row.Stock ?? 0),
          customer_price: Number(row.CustomerPrice ?? 0),
          discount_percent: Number(row.DiscountPercent ?? 0),
          final_price_incl_vat: Number(row.FinalPriceInclVAT ?? 0),
          colisage: Number(row.Colisage ?? 0),
        };
      })
      .filter((i) => !brand || i.brand_code.toUpperCase() === brand.toUpperCase());
  }

  /**
   * Agrège les articles par marque pour produire le nombre de SKU et le stock total.
   * Les marques sont triées alphabétiquement pour faciliter l'affichage côté API.
   */
  async listBrands(force = false) {
    const map = new Map<string, { marque: string; sku_count: number; stock_total: number }>();
    for (const item of await this.listItems(undefined, force)) {
      const row = map.get(item.brand_code) || {
        marque: item.brand_code,
        sku_count: 0,
        stock_total: 0,
      };
      row.sku_count += 1;
      row.stock_total += item.inventory;
      map.set(item.brand_code, row);
    }
    return [...map.values()].sort((a, b) => a.marque.localeCompare(b.marque));
  }

  private marqueToCode(marque: string): string {
    const cleaned = marque
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .toUpperCase();
    return (cleaned || 'UNKNOWN').slice(0, 40);
  }

  /**
   * Importe les marques détectées dans l'API FGT vers le pilotage.
   * Crée ou met à jour les fiches marques et initialise leurs gates de lancement.
   */
  async syncBrandsToPilotage(force = false) {
    const apiBrands = await this.listBrands(force);
    let created = 0;
    let skipped = 0;
    let updated = 0;

    for (const row of apiBrands) {
      const code = this.marqueToCode(row.marque);
      const existing = await this.brands.findOne({ where: { code } });
      const notes = `Import API FGT · ${row.sku_count} SKU · stock ${Math.round(row.stock_total)}`;
      if (existing) {
        existing.notes = notes;
        if (!existing.name) existing.name = row.marque;
        await this.brands.save(existing);
        updated += 1;
        skipped += 1;
        continue;
      }
      const brand = await this.brands.save({
        code,
        name: row.marque,
        supplier: null,
        phase: 'launch',
        current_gate: 'G6',
        launch_date: null,
        notes,
        owner_id: null,
      });
      for (const gate of GATES) {
        const items = defaultChecklist(gate);
        const done = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'].includes(gate);
        if (done) items.forEach((i) => (i.done = true));
        await this.gates.save({
          brand_id: brand.id,
          gate,
          decision: done ? 'GO' : 'PENDING',
          checklist_json: JSON.stringify(items),
          decided_by: done ? 'api-sync' : null,
          decided_at: done ? new Date() : null,
          comment: done
            ? 'Décision auto-générée par sync API FGT (source=sync) — hors validation manuelle Stage-Gate'
            : null,
          source: done ? 'sync' : 'manual',
        });
      }
      created += 1;
    }

    return {
      created,
      skipped,
      updated,
      total_api: apiBrands.length,
      cache_ttl_seconds: CACHE_TTL_MS / 1000,
    };
  }

  /**
   * Résout le libellé de marque à utiliser pour rapprocher le pilotage et le catalogue.
   * Privilégie le nom métier puis revient au code interne si nécessaire.
   */
  resolveMarque(brand: Brand): string {
    return brand.name || brand.code;
  }

  /**
   * Retrouve les articles API associés à une marque de pilotage.
   * Essaie le nom, le code puis une comparaison normalisée des codes marque.
   */
  async itemsForBrand(brand: Brand, force = false): Promise<FgtItem[]> {
    const byName = await this.listItems(brand.name, force);
    if (byName.length) return byName;
    const byCode = await this.listItems(brand.code, force);
    if (byCode.length) return byCode;
    const target = this.marqueToCode(brand.name || brand.code);
    const all = await this.listItems(undefined, force);
    return all.filter(
      (i) =>
        this.marqueToCode(i.brand_code) === target ||
        this.marqueToCode(i.brand_code) === brand.code.toUpperCase(),
    );
  }

  /**
   * Produit un instantané catalogue pour une marque fournie sous forme de texte.
   * Utilise les articles FGT correspondants et calcule les indicateurs de stock suggérés.
   */
  async brandSnapshot(marque: string, force = false) {
    let items = await this.listItems(marque, force);
    if (!items.length) {
      const all = await this.listItems(undefined, force);
      const target = this.marqueToCode(marque);
      items = all.filter((i) => this.marqueToCode(i.brand_code) === target);
    }
    return this.snapshotFromItems(marque, items);
  }

  /**
   * Produit un instantané catalogue pour une entité marque de pilotage.
   * Sert aux endpoints qui travaillent déjà avec les données TypeORM de la marque.
   */
  async brandSnapshotForBrand(brand: Brand, force = false) {
    const items = await this.itemsForBrand(brand, force);
    return this.snapshotFromItems(brand.name || brand.code, items);
  }

  private snapshotFromItems(marque: string, items: FgtItem[]) {
    const skuCount = items.length;
    const stockTotal = items.reduce((s, i) => s + i.inventory, 0);
    const zeroStock = items.filter((i) => i.inventory <= 0).length;
    const lowStock = items.filter((i) => i.inventory > 0 && i.inventory < 50).length;
    const inStock = items.filter((i) => i.inventory > 0).length;
    const avgDiscount =
      skuCount === 0
        ? 0
        : items.reduce((s, i) => s + (i.discount_percent || 0), 0) / skuCount;
    const disponibilite = skuCount === 0 ? 0 : Math.round((inStock / skuCount) * 100);
    const stockScore =
      skuCount === 0
        ? 0
        : Math.max(0, Math.min(100, Math.round(100 - (zeroStock / skuCount) * 100 - (lowStock / skuCount) * 30)));
    const overrideCritical = zeroStock > 0 && zeroStock / Math.max(skuCount, 1) >= 0.25;

    const suggested_health = {
      period: 'M1',
      // Dimensions non fournies par articleList → neutre 70 (à ajuster manuellement)
      ca_vs_forecast: 70,
      distribution: 70,
      rotation: 70,
      clients_actifs: 70,
      disponibilite,
      stock: stockScore,
      marge: Math.max(40, Math.min(95, Math.round(85 - avgDiscount))),
      marketing: 70,
      override_critical: overrideCritical,
    };

    const dimensions = (
      [
        'ca_vs_forecast',
        'distribution',
        'rotation',
        'clients_actifs',
        'disponibilite',
        'stock',
        'marge',
        'marketing',
      ] as const
    ).map((dimension) => ({
      dimension,
      value: suggested_health[dimension] as number,
      is_estimated: ESTIMATED_HEALTH_DIMENSIONS.has(dimension),
    }));

    return {
      marque,
      sku_count: skuCount,
      stock_total: stockTotal,
      zero_stock_skus: zeroStock,
      low_stock_skus: lowStock,
      in_stock_skus: inStock,
      avg_discount: Math.round(avgDiscount * 10) / 10,
      suggested_health,
      dimensions,
      items: items.slice(0, 100),
    };
  }

  /**
   * Calcule les alertes de stock par marque à partir des articles FGT.
   * Signale les ruptures et les niveaux sous le seuil choisi avec une sévérité métier.
   */
  async stockAlerts(threshold = 50) {
    const items = await this.listItems();
    const byMarque = new Map<string, FgtItem[]>();
    for (const item of items) {
      const list = byMarque.get(item.brand_code) || [];
      list.push(item);
      byMarque.set(item.brand_code, list);
    }

    const alerts: {
      marque: string;
      sku_count: number;
      zero_stock: number;
      low_stock: number;
      stock_total: number;
      severity: 'critique' | 'orange';
    }[] = [];

    for (const [marque, rows] of byMarque) {
      const zero = rows.filter((i) => i.inventory <= 0).length;
      const low = rows.filter((i) => i.inventory > 0 && i.inventory < threshold).length;
      if (zero === 0 && low === 0) continue;
      alerts.push({
        marque,
        sku_count: rows.length,
        zero_stock: zero,
        low_stock: low,
        stock_total: rows.reduce((s, i) => s + i.inventory, 0),
        severity: zero > 0 ? 'critique' : 'orange',
      });
    }

    return alerts.sort((a, b) => b.zero_stock - a.zero_stock || b.low_stock - a.low_stock);
  }
}
