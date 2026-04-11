import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('content_datasets')
export class ContentDataset {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  key!: string;

  @Column()
  version!: string;

  @Column()
  storagePath!: string;

  @Column()
  publicPath!: string;

  @Column({ default: false })
  active!: boolean;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes!: number;
}
