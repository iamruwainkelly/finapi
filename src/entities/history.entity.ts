import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('history')
export class History {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  @Column()
  dateString: string;

  @Column()
  date: number;

  @Column({ type: 'float' })
  high: number;

  @Column({ type: 'bigint' })
  volume: number;

  @Column({ type: 'float' })
  open: number;

  @Column({ type: 'float' })
  low: number;

  @Column({ type: 'float' })
  close: number;

  @Column({ type: 'float', nullable: true })
  adjClose: number | undefined;

  @CreateDateColumn({ default: () => new Date().getTime() })
  created: number;

  @UpdateDateColumn({ default: () => new Date().getTime() })
  updated: number;
}
