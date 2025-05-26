import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class Quote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  symbol: string;

  // store json
  @Column({ type: 'json', nullable: true })
  json: any;

  @CreateDateColumn({ default: () => new Date().getTime() })
  created: number;

  @UpdateDateColumn({ default: () => new Date().getTime() })
  updated: number;
}
