import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('app_users')
export class AppUser {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  deviceId!: string | null;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastActiveAt!: Date | null;

  @Column({ type: 'int', nullable: true })
  lastPageNumber!: number | null;

  @Column({ type: 'longtext', nullable: true })
  syncPayloadJson!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  syncUpdatedAt!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  appVersion!: string | null;
}
