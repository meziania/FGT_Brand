import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

/**
 * Centralise la logique d'authentification des utilisateurs FGT.
 * Vérifie les identifiants, émet les jetons JWT et retrouve les comptes par email.
 */
@Injectable()
export class AuthService {
  /**
   * Injecte le dépôt utilisateur TypeORM et le service de signature JWT.
   */
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Vérifie l'existence, l'état actif et le mot de passe d'un utilisateur.
   * Lève une exception d'authentification si les identifiants sont invalides.
   */
  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.users.findOne({ where: { email } });
    if (!user || !user.is_active) throw new UnauthorizedException('Email ou mot de passe incorrect');
    const ok = await bcrypt.compare(password, user.hashed_password);
    if (!ok) throw new UnauthorizedException('Email ou mot de passe incorrect');
    return user;
  }

  /**
   * Authentifie un utilisateur et produit un jeton bearer JWT.
   * Le jeton contient l'email et le rôle nécessaires aux contrôles d'accès.
   */
  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    return {
      access_token: await this.jwt.signAsync({ sub: user.email, role: user.role }),
      token_type: 'bearer',
    };
  }

  /**
   * Recherche un utilisateur par email dans la base SQLite via TypeORM.
   * Utilisé notamment par la stratégie JWT lors de la validation des requêtes.
   */
  async findByEmail(email: string) {
    return this.users.findOne({ where: { email } });
  }
}
