import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { ActionItem } from '../entities/action-item.entity';
import { Brand } from '../entities/brand.entity';
import { GateReview } from '../entities/gate-review.entity';
import { HealthScore } from '../entities/health-score.entity';
import { BrandsController } from './brands.controller';

/**
 * Module de pilotage des marques et des décisions de lancement.
 * Fournit au contrôleur les dépôts TypeORM nécessaires et l'accès au catalogue FGT.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Brand, GateReview, ActionItem, HealthScore]),
    CatalogModule,
  ],
  controllers: [BrandsController],
})
export class BrandsModule {}
