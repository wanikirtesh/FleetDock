package com.fleetdock.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;

@Slf4j
@Service
public class VaultEncryptionService {

    private final byte[] keyBytes;
    private static final int GCM_IV_LENGTH = 12;
    private static final int GCM_TAG_LENGTH = 128;

    public VaultEncryptionService(@Value("${fleetdock.security.vault-key:fleetdock-aes-256-master-key-xyz}") String masterKey) {
        // Normalize key to 32 bytes (256-bit)
        byte[] raw = masterKey.getBytes(StandardCharsets.UTF_8);
        this.keyBytes = new byte[32];
        System.arraycopy(raw, 0, this.keyBytes, 0, Math.min(raw.length, 32));
    }

    public String encrypt(String plainText) {
        if (plainText == null || plainText.isEmpty()) return plainText;
        try {
            byte[] iv = new byte[GCM_IV_LENGTH];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            SecretKeySpec keySpec = new SecretKeySpec(this.keyBytes, "AES");
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, spec);

            byte[] cipherText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);

            return "ENC:" + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            log.error("Encryption failed, fallback to plain", e);
            return plainText;
        }
    }

    public String decrypt(String encryptedText) {
        if (encryptedText == null || !encryptedText.startsWith("ENC:")) return encryptedText;
        try {
            byte[] combined = Base64.getDecoder().decode(encryptedText.substring(4));
            byte[] iv = new byte[GCM_IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH);

            int cipherLength = combined.length - GCM_IV_LENGTH;
            byte[] cipherText = new byte[cipherLength];
            System.arraycopy(combined, GCM_IV_LENGTH, cipherText, 0, cipherLength);

            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            SecretKeySpec keySpec = new SecretKeySpec(this.keyBytes, "AES");
            cipher.init(Cipher.DECRYPT_MODE, keySpec, spec);

            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("Decryption failed", e);
            return encryptedText;
        }
    }
}
