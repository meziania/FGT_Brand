import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protège les routes NestJS avec la stratégie Passport JWT.
 * Vérifie la présence et la validité du bearer token avant de laisser passer la requête.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
