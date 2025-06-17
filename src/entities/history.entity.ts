import { PrimaryGeneratedColumn, Column, BeforeInsert, Entity } from 'typeorm';

@Entity('history')
export class History {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  symbol: string;

  @Column({ type: 'bigint' })
  date: number;

  @Column({ type: 'varchar' })
  dateString: string;

  @Column({ type: 'float', nullable: true })
  high: number | null | undefined;

  @Column({ type: 'bigint', nullable: true })
  volume: number | null | undefined;

  @Column({ type: 'float', nullable: true })
  open: number | null | undefined;

  @Column({ type: 'float', nullable: true })
  low: number | null | undefined;

  @Column({ type: 'float', nullable: true })
  close: number | null | undefined;

  @Column({ type: 'float', nullable: true })
  adjclose: number | null | undefined;

  @Column({ type: 'bigint' })
  created: number;

  // store the string date in ISO format
  @Column({ type: 'varchar', nullable: true })
  createdString: string;

  @BeforeInsert()
  setCreatedString() {
    if (this.created && !this.createdString) {
      this.createdString = new Date(this.created).toISOString();
    }
  }
}
