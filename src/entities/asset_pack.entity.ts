import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('asset_packs')
export class AssetPack {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  edition!: string;

  @Column()
  version!: string;

  @Column()
  storagePath!: string;

  @Column({ default: 0 })
  pageCount!: number;

  @Column({ default: 'png' })
  fileExtension!: string;

  @Column({ default: false })
  active!: boolean;

  @Column({ type: 'bigint', default: 0 })
  sizeBytes!: number;
}
