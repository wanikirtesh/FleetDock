package com.fleetdock.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Lob;
import lombok.*;

@Embeddable
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthCredential {

    private String username;

    @Column(name = "auth_password")
    private String password;

    @Lob
    @Column(name = "private_key", columnDefinition = "TEXT")
    private String privateKey;

    private String passphrase;

    @Lob
    @Column(name = "tls_ca", columnDefinition = "TEXT")
    private String tlsCa;

    @Lob
    @Column(name = "tls_cert", columnDefinition = "TEXT")
    private String tlsCert;

    @Lob
    @Column(name = "tls_key", columnDefinition = "TEXT")
    private String tlsKey;

    private String agentToken;

    private Boolean useSudo;
}
