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
    // Note: global prefix is /api, so expose also via brands? 
    // We'll mount a non-prefixed root in main — actually global prefix applies.
    // Frontend hits / which won't work with global prefix. Fix main.ts.
    const source = (this.config.get('DATA_SOURCE') || 'api').toLowerCase();
    const base = this.config.get('FGT_API_BASE_URL') || '';
    return {
      app: 'FGT Launch Control Tower',
      data_source: source,
      docs: '/api',
      note:
        source === 'api' || source === 'fgt' || source === 'bc'
          ? `API FGT active (${base}/api/articleList)`
          : 'Mode mock — set DATA_SOURCE=api',
      stack: 'NestJS + TypeScript + TypeORM + SQLite',
    };
  }
}
