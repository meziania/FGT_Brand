import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { CatalogModule } from './catalog/catalog.module';
import { RoutinesModule } from './routines/routines.module';
import { SeedService } from './seed/seed.service';
import { User } from './entities/user.entity';
import { Brand } from './entities/brand.entity';
import { GateReview } from './entities/gate-review.entity';
import { ActionItem } from './entities/action-item.entity';
import { HealthScore } from './entities/health-score.entity';
import { AppController } from './app.controller';

/**
 * Module racine de l'application NestJS.
 * Configure la base SQLite TypeORM, les modules fonctionnels et le service de seed initial.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: 'fgt_launch.db',
      entities: [User, Brand, GateReview, ActionItem, HealthScore],
      synchronize: true,
    }),
    TypeOrmModule.forFeature([User, Brand, GateReview, ActionItem, HealthScore]),
    AuthModule,
    BrandsModule,
    CatalogModule,
    RoutinesModule,
  ],
  controllers: [AppController],
  providers: [SeedService],
})
export class AppModule implements OnModuleInit {
  /**
   * Injecte le service chargé d'initialiser les données minimales au démarrage.
   */
  constructor(private readonly seed: SeedService) {}

  /**
   * Exécute les tâches d'initialisation après le chargement du module.
   * Crée les utilisateurs par défaut et supprime les marques de démonstration obsolètes.
   */
  async onModuleInit() {
    await this.seed.seedUsers();
    await this.seed.clearDemoBrands();
  }
}
