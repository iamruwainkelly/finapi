import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class HistoryVerification {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date', nullable: true })
  lastRanDate: number;

  @CreateDateColumn({ default: () => Date.now() })
  created: number;

  @UpdateDateColumn({ default: () => Date.now() })
  updated: number;
}
