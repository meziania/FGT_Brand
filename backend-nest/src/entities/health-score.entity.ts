import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Représente un score santé calculé pour une marque et une période.
 * Stocke les dimensions pondérées utilisées par la Control Tower FGT.
 */
@Entity('health_scores')
export class HealthScore {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  brand_id!: number;

  @Column()
  period!: string;

  @Column('float')
  score!: number;

  @Column()
  status!: string;

  @Column('float', { default: 0 })
  ca_vs_forecast!: number;

  @Column('float', { default: 0 })
  distribution!: number;

  @Column('float', { default: 0 })
  rotation!: number;

  @Column('float', { default: 0 })
  clients_actifs!: number;

  @Column('float', { default: 0 })
  disponibilite!: number;

  @Column('float', { default: 0 })
  stock!: number;

  @Column('float', { default: 0 })
  marge!: number;

  @Column('float', { default: 0 })
  marketing!: number;

  @Column({ default: false })
  override_critical!: boolean;

  @CreateDateColumn()
  computed_at!: Date;
}
