import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Expose les informations générales de l'API FGT Launch Control Tower.
 * Sert de point d'entrée léger pour vérifier la source de données et la pile applicative active.
 */
@Controller()
export class AppController {
  /**
   * Initialise le contrôleur avec le service de configuration NestJS.
   */
  constructor(private readonly config: ConfigService) {}

  /**
   * Retourne les métadonnées publiques de l'application et le mode de données utilisé.
   * La réponse indique notamment si l'API FGT ou le mode mock est actif.
   */
  @Get()
  root() {
    const source = (this.config.get('DATA_SOURCE') || 'api').toLowerCase();
    const base = this.config.get('FGT_API_BASE_URL') || '';
    return {
      app: 'FGT Launch Control Tower',
      data_source: source,
      docs: '/api',
      note:
        source === 'mock'
          ? 'Mode mock (démo cloud / hors réseau FGT)'
          : `API FGT configurée (${base || 'default'}) — fallback mock si injoignable`,
      stack: 'NestJS + TypeScript + TypeORM + SQLite',
    };
  }
}
