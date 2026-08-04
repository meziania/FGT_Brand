import { Controller, ForbiddenException, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { canSyncBrands } from '../common/domain';
import { User } from '../entities/user.entity';
import { CatalogService } from './catalog.service';

/**
 * Expose les routes catalogue connectées à l'API FGT Business Central.
 * Fournit les articles, les marques, les synchronisations et les alertes stock.
 */
@Controller('api/bc')
@UseGuards(JwtAuthGuard)
export class CatalogController {
  /**
   * Injecte le service catalogue et la configuration utilisée pour informer les réponses.
   */
  constructor(
    private readonly catalog: CatalogService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Retourne les articles FGT normalisés avec filtrage optionnel par marque.
   * Limite le volume retourné et indique si le cache a été utilisé.
   */
  @Get('items')
  async items(
    @Query('brand') brand?: string,
    @Query('limit') limit = '100',
    @Query('force') force?: string,
  ) {
    const items = await this.catalog.listItems(brand, force === '1');
    const n = Math.max(1, Math.min(Number(limit) || 100, 500));
    return {
      data_source: this.catalog.getDataSourceLabel(),
      count: items.length,
      items: items.slice(0, n),
      cached: force !== '1',
    };
  }

  /**
   * Liste les marques détectées dans le catalogue API FGT.
   * Agrège le nombre de SKU et le stock total par marque.
   */
  @Get('brands')
  async brands(@Query('force') force?: string) {
    const brands = await this.catalog.listBrands(force === '1');
    return {
      data_source: this.catalog.getDataSourceLabel(),
      count: brands.length,
      brands,
      cached: force !== '1',
    };
  }

  /**
   * Synchronise les marques de l'API FGT vers le pilotage Control Tower.
   * Peut forcer le rafraîchissement du cache avant l'import.
   */
  @Post('sync-brands')
  async syncBrands(@Req() req: { user: User }, @Query('force') force?: string) {
    if (!canSyncBrands(req.user.role)) {
      throw new ForbiddenException('Sync API réservée au Responsable Développement');
    }
    const result = await this.catalog.syncBrandsToPilotage(force === '1');
    return {
      data_source: this.catalog.getDataSourceLabel(),
      ...result,
    };
  }

  /**
   * Retourne les alertes de stock calculées depuis les articles FGT.
   * Les alertes distinguent les ruptures critiques et les stocks faibles.
   */
  @Get('stock-alerts')
  async stockAlerts() {
    const alerts = await this.catalog.stockAlerts();
    return {
      data_source: this.catalog.getDataSourceLabel(),
      count: alerts.length,
      alerts,
    };
  }

  /**
   * Produit un instantané catalogue pour la marque demandée en query string.
   * Retourne une erreur simple si le paramètre marque est absent.
   */
  @Get('snapshot')
  async snapshot(@Query('marque') marque?: string) {
    if (!marque) return { error: 'marque required' };
    return this.catalog.brandSnapshot(marque);
  }

  /**
   * Retourne les métriques catalogue disponibles pour une marque donnée.
   * Les indicateurs de ventes restent explicitement indisponibles avec l'endpoint articleList.
   */
  @Get('sales/:brandCode')
  async sales(@Param('brandCode') brandCode: string) {
    const items = await this.catalog.listItems(brandCode);
    return {
      ca_real: null,
      ca_forecast: null,
      clients_actifs: null,
      sku_count: items.length,
      stock_total: items.reduce((s, i) => s + i.inventory, 0),
      note: 'Ventes/forecast non disponibles sur articleList',
    };
  }
}
