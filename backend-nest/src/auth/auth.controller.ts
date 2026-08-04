import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Expose les routes d'authentification de l'API FGT.
 * Gère la connexion et la récupération du profil utilisateur authentifié.
 */
@Controller('api/auth')
export class AuthController {
  /**
   * Initialise le contrôleur avec le service métier d'authentification.
   */
  constructor(private readonly auth: AuthService) {}

  /**
   * Authentifie un utilisateur à partir d'un identifiant ou d'un email et d'un mot de passe.
   * Retourne un jeton JWT utilisable sur les routes protégées.
   */
  @Post('login')
  async login(
    @Body('username') username?: string,
    @Body('email') email?: string,
    @Body('password') password?: string,
  ) {
    // Support form-urlencoded OAuth2 style + JSON
    return this.auth.login(username || email || '', password || '');
  }

  /**
   * Retourne les informations de profil de l'utilisateur courant.
   * La route est protégée par le guard JWT.
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: { id: number; email: string; full_name: string; role: string } }) {
    const u = req.user;
    return { id: u.id, email: u.email, full_name: u.full_name, role: u.role };
  }
}
