import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { ActionItem } from '../entities/action-item.entity';
import { Brand } from '../entities/brand.entity';
import { GateReview } from '../entities/gate-review.entity';
import { HealthScore } from '../entities/health-score.entity';
import { User } from '../entities/user.entity';

/**
 * Fournit les routines de seed et de nettoyage exécutées au démarrage.
 * Prépare les utilisateurs de démonstration et retire les anciennes marques fictives.
 */
@Injectable()
export class SeedService {
  /**
   * Injecte les dépôts TypeORM nécessaires aux opérations d'initialisation.
   */
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Brand) private readonly brands: Repository<Brand>,
    @InjectRepository(GateReview) private readonly gates: Repository<GateReview>,
    @InjectRepository(ActionItem) private readonly actions: Repository<ActionItem>,
    @InjectRepository(HealthScore) private readonly scores: Repository<HealthScore>,
  ) {}

  /**
   * Crée les utilisateurs de base si aucun compte n'existe encore.
   * Le mot de passe de démonstration est haché avant insertion en base SQLite.
   */
  async seedUsers() {
    const count = await this.users.count();
    if (count > 0) return;
    const password = await bcrypt.hash('fgt123', 10);
    await this.users.save([
      {
        email: 'dev@fgt.local',
        full_name: 'Responsable Développement',
        role: 'developpement',
        hashed_password: password,
        is_active: true,
      },
      {
        email: 'direction@fgt.local',
        full_name: 'Direction FGT',
        role: 'direction',
        hashed_password: password,
        is_active: true,
      },
      {
        email: 'commercial@fgt.local',
        full_name: 'Commercial',
        role: 'commercial',
        hashed_password: password,
        is_active: true,
      },
    ]);
  }

  /**
   * Supprime les anciennes marques de démonstration et leurs données liées.
   * Nettoie les actions, scores et gates avant de retirer les marques concernées.
   */
  async clearDemoBrands() {
    const brands = await this.brands
      .createQueryBuilder('b')
      .where('b.code IN (:...codes)', { codes: ['NOVA', 'SOLARA', 'OLIVA'] })
      .getMany();
    if (!brands.length) return;
    const ids = brands.map((b) => b.id);
    await this.actions.createQueryBuilder().delete().where('brand_id IN (:...ids)', { ids }).execute();
    await this.scores.createQueryBuilder().delete().where('brand_id IN (:...ids)', { ids }).execute();
    await this.gates.createQueryBuilder().delete().where('brand_id IN (:...ids)', { ids }).execute();
    await this.brands.createQueryBuilder().delete().where('id IN (:...ids)', { ids }).execute();
  }
}
