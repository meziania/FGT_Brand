import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

/**
 * Définit la stratégie Passport utilisée pour valider les jetons JWT.
 * Récupère la clé secrète depuis la configuration et rattache l'utilisateur actif à la requête.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  /**
   * Configure l'extraction du bearer token et la clé de signature JWT.
   */
  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET') || 'dev-secret-change-me',
    });
  }

  /**
   * Valide le payload JWT en retrouvant l'utilisateur correspondant.
   * Retourne l'utilisateur actif ou `null` si le compte n'est plus autorisé.
   */
  async validate(payload: { sub: string }) {
    const user = await this.auth.findByEmail(payload.sub);
    if (!user || !user.is_active) return null;
    return user;
  }
}
