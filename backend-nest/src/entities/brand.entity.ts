import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Représente une marque suivie dans le processus de lancement FGT.
 * Stocke son état de phase, sa gate courante et les informations de pilotage associées.
 */
@Entity('brands')
export class Brand {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  code!: string;

  @Column()
  name!: string;

  @Column({ type: 'varchar', nullable: true })
  supplier!: string | null;

  @Column({ default: 'development' })
  phase!: string;

  @Column({ default: 'G0' })
  current_gate!: string;

  @Column({ type: 'date', nullable: true })
  launch_date!: string | null;

  @Column({ type: 'int', nullable: true })
  owner_id!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
