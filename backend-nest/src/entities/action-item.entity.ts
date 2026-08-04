import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Représente une action opérationnelle liée à une marque.
 * Porte le rôle responsable, les délais, les livrables et l'état de suivi.
 */
@Entity('action_items')
export class ActionItem {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  brand_id!: number;

  @Column()
  code!: string;

  @Column()
  title!: string;

  @Column()
  owner_role!: string;

  @Column({ type: 'varchar', nullable: true })
  approver_role!: string | null;

  @Column({ default: 5 })
  sla_days!: number;

  @Column({ default: 'open' })
  status!: string;

  @Column({ type: 'date', nullable: true })
  due_date!: string | null;

  @Column({ type: 'varchar', nullable: true })
  deliverable!: string | null;

  @Column({ type: 'varchar', nullable: true })
  close_condition!: string | null;
}
